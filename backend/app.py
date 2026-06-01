import os
import json
import uuid
import base64
import tempfile
import threading

from flask import Flask, request, send_file, jsonify, Response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from gtts import gTTS

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

_config_path = os.getenv("CONFIG_PATH", "config.json")
_config = {}
try:
    with open(_config_path) as f:
        _config = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    pass

CONFIG = {
    "port": int(os.getenv("PORT", _config.get("port", 8080))),
    "max_file_size": int(
        os.getenv("MAX_FILE_SIZE", _config.get("max_file_size", 5242880))
    ),
    "max_chars_per_chunk": int(
        os.getenv("MAX_CHARS_PER_CHUNK", _config.get("max_chars_per_chunk", 2500))
    ),
    "gemini_model": os.getenv(
        "GEMINI_MODEL", _config.get("gemini_model", "gemini-2.0-flash-exp")
    ),
    "gemini_voice": os.getenv("GEMINI_VOICE", _config.get("gemini_voice", "Kore")),
    "rate_limit": os.getenv("RATE_LIMIT", _config.get("rate_limit", "10 per minute")),
}

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[CONFIG["rate_limit"]],
    storage_uri="memory://",
)


@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify(
        {
            "error": f"Demasiadas solicitudes. Límite: {e.description}",
        }
    ), 429


tasks = {}
tasks_lock = threading.Lock()


def _new_task():
    tid = uuid.uuid4().hex
    with tasks_lock:
        tasks[tid] = {"progress": 0, "status": "pending", "error": None, "output": None}
    return tid


def _update_task(tid, **kw):
    with tasks_lock:
        tasks[tid].update(kw)


def _get_task(tid):
    with tasks_lock:
        return dict(tasks.get(tid, {}))


def _cleanup_task(tid):
    with tasks_lock:
        info = tasks.pop(tid, {})
    for key in ("output", "melody_path"):
        path = info.get(key)
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except:
                pass


def _apply_fadeout(path, duration_ms=3000):
    from pydub import AudioSegment

    try:
        audio = AudioSegment.from_file(path)
        if len(audio) > duration_ms:
            audio = audio.fade_out(duration_ms)
        else:
            audio = audio.fade_out(len(audio) // 2)
        audio.export(path, format="mp3")
    except Exception:
        pass


def _try_fuse(tid, output_path):
    with tasks_lock:
        mel = tasks.get(tid, {}).get("melody_path")
    if mel and os.path.exists(mel):
        _fuse_with_melody(output_path, mel, output_path)


def _run_gtts(tid, text, output_path):
    try:
        _update_task(tid, status="processing", progress=5)
        tts = gTTS(text=text, lang="es", slow=False)
        _update_task(tid, progress=50)
        tts.save(output_path)
        _update_task(tid, progress=90)
        _try_fuse(tid, output_path)
        _apply_fadeout(output_path)
        _update_task(tid, progress=100, status="completed", output=output_path)
    except Exception as e:
        _update_task(tid, status="error", error=str(e))


def _run_gemini(tid, text, api_key, output_path):
    try:
        from google import genai
        from google.genai import types
        from pydub import AudioSegment

        _update_task(tid, status="processing", progress=5)
        client = genai.Client(api_key=api_key)

        segments = _split_text(text)
        total = len(segments)
        audio_final = AudioSegment.empty()

        for i, segment in enumerate(segments, 1):
            response = client.models.generate_content(
                model=CONFIG["gemini_model"],
                contents=segment,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=CONFIG["gemini_voice"]
                            )
                        )
                    ),
                ),
            )
            pcm = response.candidates[0].content.parts[0].inline_data.data
            audio_segment = AudioSegment(
                data=pcm,
                sample_width=2,
                frame_rate=24000,
                channels=1,
            )
            audio_final += audio_segment
            pct = int(5 + (i / total) * 90)
            _update_task(tid, progress=pct)

        audio_final.export(output_path, format="mp3")
        _update_task(tid, progress=90)
        _try_fuse(tid, output_path)
        _apply_fadeout(output_path)
        _update_task(tid, progress=100, status="completed", output=output_path)
    except Exception as e:
        _update_task(tid, status="error", error=str(e))


def _fuse_with_melody(voice_path, melody_path, output_path, melody_volume=0.3):
    from pydub import AudioSegment

    voice = AudioSegment.from_file(voice_path)
    melody = AudioSegment.from_file(melody_path)

    if len(melody) < len(voice):
        repeats = int(len(voice) / len(melody)) + 1
        melody = melody * repeats

    melody = melody[: len(voice)]
    melody = melody - abs(melody.dBFS * (1 - melody_volume)) if melody.dBFS else melody

    mixed = voice.overlay(melody, loop=False)
    mixed.export(output_path, format="mp3")
    os.replace(output_path, voice_path)


def _split_text(text, max_chars=None):
    if max_chars is None:
        max_chars = CONFIG["max_chars_per_chunk"]
    text = (text or "").strip()
    if not text:
        return []
    parts, current, current_len = [], [], 0
    for word in text.split():
        extra = len(word) + (1 if current else 0)
        if current_len + extra > max_chars:
            parts.append(" ".join(current))
            current, current_len = [word], len(word)
        else:
            current.append(word)
            current_len += extra
    if current:
        parts.append(" ".join(current))
    return parts


@app.route("/api/tts", methods=["POST"])
def tts_start():
    data = request.get_json()
    text = (data.get("text") or "").strip()
    engine = data.get("engine", "gtts")
    api_key = data.get("api_key", "")
    melody_base64 = data.get("melody_base64", "")

    if not text:
        return jsonify({"error": "No se proporcionó texto"}), 400

    melody_path = None
    if melody_base64:
        try:
            mel_temp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
            mel_temp.write(base64.b64decode(melody_base64))
            mel_temp.close()
            melody_path = mel_temp.name
        except Exception:
            return jsonify({"error": "El archivo de melodía no es válido"}), 400

    temp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    temp_path = temp.name
    temp.close()

    tid = _new_task()
    _update_task(tid, output=temp_path, melody_path=melody_path)

    if engine == "gemini":
        if not api_key:
            _cleanup_task(tid)
            return jsonify({"error": "Se requiere API Key para Gemini"}), 400
        t = threading.Thread(
            target=_run_gemini, args=(tid, text, api_key, temp_path), daemon=True
        )
    elif engine == "gtts":
        t = threading.Thread(target=_run_gtts, args=(tid, text, temp_path), daemon=True)
    else:
        _cleanup_task(tid)
        return jsonify({"error": f"Motor no soportado: {engine}"}), 400

    t.start()
    return jsonify({"task_id": tid}), 202


@app.route("/api/tts/<task_id>")
def tts_status(task_id):
    info = _get_task(task_id)
    if not info:
        return jsonify({"error": "Tarea no encontrada"}), 404
    return jsonify(
        {
            "status": info["status"],
            "progress": info["progress"],
            "error": info["error"],
        }
    )


@app.route("/api/tts/<task_id>/download")
def tts_download(task_id):
    info = _get_task(task_id)
    if not info:
        return jsonify({"error": "Tarea no encontrada"}), 404
    if info["status"] != "completed":
        return jsonify({"error": "Tarea aún no completada"}), 400
    path = info["output"]
    if not path or not os.path.exists(path):
        return jsonify({"error": "Archivo no encontrado"}), 404

    def cleanup_and_stream():
        with open(path, "rb") as f:
            yield from f
        os.unlink(path)
        _cleanup_task(task_id)

    return Response(
        cleanup_and_stream(),
        mimetype="audio/mpeg",
        headers={"Content-Disposition": "attachment; filename=audio.mp3"},
    )


@app.route("/api/config")
def config():
    return jsonify(
        {
            "max_file_size": CONFIG["max_file_size"],
            "max_chars_per_chunk": CONFIG["max_chars_per_chunk"],
            "gemini_model": CONFIG["gemini_model"],
            "gemini_voice": CONFIG["gemini_voice"],
            "rate_limit": CONFIG["rate_limit"],
        }
    )


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
