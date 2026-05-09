import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import '../styles/AdminVideoUpload.css';

const defaultVideoPoster = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" rx="36" fill="%230052cc"/><circle cx="180" cy="140" r="90" fill="%23ffffff" opacity="0.16"/><circle cx="980" cy="130" r="130" fill="%23ffffff" opacity="0.14"/><circle cx="920" cy="540" r="120" fill="%2300ff88" opacity="0.08"/><text x="80" y="590" fill="%23ffffff" font-family="Arial, sans-serif" font-size="44" font-weight="700">Admin Video Spotlight</text><text x="80" y="640" fill="%23d6e7ff" font-family="Arial, sans-serif" font-size="24">Upload airline loading, onboarding, or product update video here</text></svg>'

export default function AdminVideoUpload() {
  const [videoUrl, setVideoUrl] = useState('')
  const [status, setStatus] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [savingAudio, setSavingAudio] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    api.apiGet('/api/public/hero-media')
      .then((data) => {
        if (data.media?.url) {
          setVideoUrl(data.media.url)
        }
        if (typeof data.media?.isMuted === 'boolean') {
          setAudioEnabled(!data.media.isMuted)
        }
      })
      .catch(() => {})

    return () => {
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  }, [videoUrl])

  const handleToggleAudio = async () => {
    const next = !audioEnabled
    setAudioEnabled(next)
    setSavingAudio(true)
    setStatus(next ? 'Enabling sound on the homepage video…' : 'Muting the homepage video…')
    try {
      const adminToken = localStorage.getItem('sbu_token') || ''
      const response = await fetch(`${api.API_BASE}/api/media/hero/mute`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({ isMuted: !next })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Audio update failed')
      setStatus(next ? 'Homepage video will play with sound.' : 'Homepage video is now muted.')
      window.dispatchEvent(new Event('hero-media-updated'))
    } catch (error) {
      setAudioEnabled(!next)
      setStatus(error.message || 'Audio update failed')
    } finally {
      setSavingAudio(false)
    }
  }

  const handleSelectVideo = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const isImage = String(file.type || '').startsWith('image/')
    const isVideo = String(file.type || '').startsWith('video/')
    if (!isImage && !isVideo) {
      setStatus('Please choose an image or video file')
      return
    }

    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl)
    }

    const nextUrl = URL.createObjectURL(file)
    setVideoUrl(nextUrl)
    setStatus('Uploading media...')

    const formData = new FormData()
    formData.append('media', file)

    const adminToken = localStorage.getItem('sbu_token') || ''

    fetch(`${api.API_BASE}/api/media/hero`, {
      method: 'POST',
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
      body: formData
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.message || 'Upload failed')
        }

        if (payload.url) {
          setVideoUrl(payload.url)
        }
        setStatus('Hero media updated successfully')
        window.dispatchEvent(new Event('hero-media-updated'))
      })
      .catch((error) => {
        setStatus(error.message || 'Upload failed')
      })
  }

  return (
    <section className="video-section">
      <div className="container">
        <div className="video-header">
          <p className="section-kicker">Admin Media Area</p>
          <h2 className="section-title">Airline Loading Video</h2>
          <p className="section-subtitle">
            Add a high-quality image or short looping airline video for the hero area. Admins can upload and replace it anytime.
          </p>
        </div>

        <div className="video-panel">
          <div className="video-player-shell">
            <video
              className="hero-video"
              controls
              poster={defaultVideoPoster}
              src={videoUrl || undefined}
              playsInline
              loop
              preload="metadata"
            />
            {!videoUrl && (
              <div className="video-empty-state">
                <div className="video-empty-icon">▶</div>
                <p>No video uploaded yet</p>
                <span>Use the admin button to upload a RwandaAir, Ethiopian, or SBU promo clip.</span>
              </div>
            )}
          </div>

          <div className="video-upload-card">
            <h3>Admin Upload</h3>

            <button className="upload-button" onClick={() => fileInputRef.current?.click()}>
              Upload / Replace Media
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleSelectVideo}
              className="hidden-input"
            />

            <div className="audio-toggle-row">
              <div className="audio-toggle-text">
                <strong>Homepage video sound</strong>
                <span>{audioEnabled ? 'Plays with sound for visitors.' : 'Muted on the homepage.'}</span>
              </div>
              <label className={`audio-switch${audioEnabled ? ' on' : ''}${savingAudio ? ' saving' : ''}`}>
                <input
                  type="checkbox"
                  checked={audioEnabled}
                  onChange={handleToggleAudio}
                  disabled={savingAudio}
                />
                <span className="audio-switch-track"><span className="audio-switch-thumb" /></span>
                <span className="audio-switch-label">{audioEnabled ? 'Sound ON' : 'Muted'}</span>
              </label>
            </div>

            {status ? <p className="upload-status">{status}</p> : null}
          </div>
        </div>
      </div>
    </section>
  )
}
