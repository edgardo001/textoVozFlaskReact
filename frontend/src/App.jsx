import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

function App() {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [engine, setEngine] = useState('gtts')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [error, setError] = useState('')
  const [fileSizeLimit, setFileSizeLimit] = useState(5 * 1024 * 1024)
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  )
  const [melodyName, setMelodyName] = useState('')
  const [melodyBase64, setMelodyBase64] = useState('')
  const fileInputRef = useRef(null)
  const melodyInputRef = useRef(null)
  const pollingRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        setFileSizeLimit(cfg.max_file_size)
        document.documentElement.style.setProperty('--max-chars', cfg.max_chars_per_chunk)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.txt')) {
      setError('Solo se permiten archivos .txt')
      return
    }
    if (file.size > fileSizeLimit) {
      setError(`El archivo excede el límite de ${formatSize(fileSizeLimit)}`)
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setText(ev.target.result)
      setError('')
    }
    reader.onerror = () => setError('Error al leer el archivo')
    reader.readAsText(file)
  }

  const handleMelodyUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.mp3')) {
      setError('Solo se permiten archivos .mp3')
      return
    }
    if (file.size > fileSizeLimit) {
      setError(`El archivo excede el límite de ${formatSize(fileSizeLimit)}`)
      return
    }
    setMelodyName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(',')[1]
      setMelodyBase64(base64)
      setError('')
    }
    reader.onerror = () => setError('Error al leer la melodía')
    reader.readAsDataURL(file)
  }

  const clearMelody = () => {
    setMelodyName('')
    setMelodyBase64('')
  }

  const pollTask = useCallback((taskId) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tts/${taskId}`)
        const data = await res.json()
        setProgress(data.progress)

        if (data.status === 'completed') {
          clearInterval(pollingRef.current)
          pollingRef.current = null
          const dlRes = await fetch(`/api/tts/${taskId}/download`)
          if (!dlRes.ok) throw new Error('Error al descargar el audio')
          const blob = await dlRes.blob()
          setAudioUrl(URL.createObjectURL(blob))
          setLoading(false)
        } else if (data.status === 'error') {
          clearInterval(pollingRef.current)
          pollingRef.current = null
          setError(data.error || 'Error al generar audio')
          setLoading(false)
        }
      } catch (err) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
        setError(err.message)
        setLoading(false)
      }
    }, 300)
  }, [])

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError('No hay texto para procesar')
      return
    }
    if (engine === 'gemini' && !apiKey.trim()) {
      setError('Se requiere la API Key de Google para usar Gemini')
      return
    }

    setLoading(true)
    setProgress(0)
    setError('')
    setAudioUrl(null)

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, engine, api_key: apiKey, melody_base64: melodyBase64 || undefined }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al iniciar la generación')
      }

      const { task_id } = await res.json()
      pollTask(task_id)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-inner">
          <a href="/" className="logo">
            <span className="logo-mark">TV</span>
            <span className="logo-text">Texto a Voz</span>
          </a>
          <button className="theme-btn" onClick={toggleTheme} aria-label="Cambiar tema">
            <svg className="sun" viewBox="0 0 24 24" width="18" height="18">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <svg className="moon" viewBox="0 0 24 24" width="18" height="18">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
      </nav>

      <main className="main">
        <section className="hero">
          <div className="container">
            <span className="kicker">TTS &bull; Text to Speech</span>
            <h1 className="hero-title">
              Texto a <span className="gradient-text">Voz</span>
            </h1>
            <p className="hero-subtitle">
              Convierte archivos de texto a audio utilizando{' '}
              <strong>gTTS</strong> o <strong>Gemini TTS</strong>
            </p>
          </div>
        </section>

        <section className="section-card">
          <div className="card">
            {loading && (
              <div className="overlay">
                <div className="builder">
                  <div className="bars">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span key={i} />
                    ))}
                  </div>
                  <p className="builder-text">Construyendo audio...</p>
                  <p className="builder-sub">Esto puede tomar unos momentos</p>
                  <div className="progress-wrap">
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="progress-label">{progress}%</span>
                  </div>
                </div>
              </div>
            )}

            <div className="field">
              <label className="label">Archivo de entrada</label>
              <div className="file-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  hidden
                  disabled={loading}
                />
                <button
                  className="btn btn-file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Seleccionar archivo
                </button>
                <span className="file-name">{fileName || '.txt'}</span>
              </div>
              <span className="hint">Máx. {formatSize(fileSizeLimit)}</span>
            </div>

            {text && (
              <div className="field">
                <label className="label">Vista previa del texto</label>
                <textarea
                  className={`preview ${loading ? 'muted' : ''}`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  disabled={loading}
                />
                <span className="char-count">{text.length} caracteres</span>
              </div>
            )}

            <div className="field">
              <label className="label">Motor de conversión</label>
              <div className="engine-group">
                <button
                  className={`engine-opt ${engine === 'gtts' ? 'active' : ''}`}
                  onClick={() => setEngine('gtts')}
                  disabled={loading}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  <span>gTTS</span>
                  <small>Google Text-to-Speech</small>
                </button>
                <button
                  className={`engine-opt ${engine === 'gemini' ? 'active' : ''}`}
                  onClick={() => setEngine('gemini')}
                  disabled={loading}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>Gemini TTS</span>
                  <small>requiere API Key</small>
                </button>
              </div>
            </div>

            {engine === 'gemini' && (
              <div className="field fade-in">
                <label className="label">API Key de Google Gemini</label>
                <div className="input-wrap">
                  <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    className={`input ${loading ? 'muted' : ''}`}
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    disabled={loading}
                  />
                </div>
                <p className="hint">
                  Obtén tu API key en{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                    Google AI Studio
                  </a>
                </p>
              </div>
            )}

            <div className="field">
              <label className="label">Melodía de fondo (opcional)</label>
              <div className="file-row">
                <input
                  ref={melodyInputRef}
                  type="file"
                  accept=".mp3"
                  onChange={handleMelodyUpload}
                  hidden
                  disabled={loading}
                />
                <button
                  className="btn btn-file"
                  onClick={() => melodyInputRef.current?.click()}
                  disabled={loading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  {melodyName ? 'Cambiar melodía' : 'Subir .mp3'}
                </button>
                {melodyName ? (
                  <span className="file-name melody-tag">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                    {melodyName}
                    <button className="melody-clear" onClick={clearMelody} disabled={loading} aria-label="Quitar melodía">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                ) : (
                  <span className="file-name melody-hint">Ninguna</span>
                )}
              </div>
              <span className="hint">Se fusionará como fondo musical a volumen reducido</span>
            </div>

            {error && (
              <div className="error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading || !text.trim()}
            >
              {loading ? (
                <span className="loading">
                  <span className="spinner" />
                  Procesando...
                </span>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  Generar Audio
                </>
              )}
            </button>

            {audioUrl && (
              <div className="result fade-in">
                <div className="result-divider" />
                <div className="waveform">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <span key={i} style={{ '--h': `${Math.random() * 60 + 10}%` }} />
                  ))}
                </div>
                <audio controls src={audioUrl} className="player" />
                <a className="btn btn-download" href={audioUrl} download={`audio_${engine}.mp3`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Descargar audio
                </a>
              </div>
            )}
          </div>
        </section>

        <footer className="footer">
          <div className="container">
            <p>Texto a Voz &mdash; Procesado en el servidor</p>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default App
