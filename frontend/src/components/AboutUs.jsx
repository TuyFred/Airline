import React, { useEffect, useRef, useState } from 'react';
import airplaneHero from '../assets/rwandair-real-hero.jpg';
import api from '../services/api';
import '../styles/AboutUs.css';

export default function AboutUs() {
  const [heroMedia, setHeroMedia] = useState(null);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [needsUserUnmute, setNeedsUserUnmute] = useState(false);
  const videoRef = useRef(null);
  const hasHeroVideo = heroMedia?.mediaType === 'video' && heroMedia?.url;
  const hasHeroImage = heroMedia?.mediaType === 'image' && heroMedia?.url;
  const adminMutedVideo = heroMedia?.isMuted === true;

  useEffect(() => {
    let mounted = true;

    api.apiGet('/api/public/hero-media')
      .then((data) => {
        if (mounted) {
          setHeroMedia(data.media || null);
        }
      })
      .catch(() => {
        if (mounted) {
          setHeroMedia(null);
        }
      });

    const handleUpdate = () => {
      api.apiGet('/api/public/hero-media')
        .then((data) => {
          if (mounted) setHeroMedia(data.media || null);
        })
        .catch(() => {});
    };

    window.addEventListener('hero-media-updated', handleUpdate);

    return () => {
      mounted = false;
      window.removeEventListener('hero-media-updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (!hasHeroVideo || !videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;

    const playWithSound = async () => {
      videoElement.muted = false;
      videoElement.volume = 1;
      try {
        await videoElement.play();
        setIsMuted(false);
        setNeedsUserUnmute(false);
        return true;
      } catch {
        return false;
      }
    };

    const playMuted = async () => {
      videoElement.muted = true;
      try {
        await videoElement.play();
        setIsMuted(true);
      } catch {
        /* best effort */
      }
    };

    const tryPlay = async () => {
      // Admin disabled audio globally — keep it silent.
      if (adminMutedVideo) {
        await playMuted();
        setNeedsUserUnmute(false);
        return;
      }

      // Default behaviour: attempt sound first, fall back to muted autoplay
      // and surface an "Unmute" affordance if the browser blocks audio.
      const ok = await playWithSound();
      if (!ok) {
        await playMuted();
        setNeedsUserUnmute(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tryPlay();
      }
    };

    const handleFirstUserGesture = async () => {
      if (adminMutedVideo) return;
      const ok = await playWithSound();
      if (ok) {
        document.removeEventListener('click', handleFirstUserGesture, true);
        document.removeEventListener('touchstart', handleFirstUserGesture, true);
        document.removeEventListener('keydown', handleFirstUserGesture, true);
      }
    };

    videoElement.addEventListener('canplay', tryPlay, { once: true });
    videoElement.addEventListener('pause', tryPlay);
    videoElement.addEventListener('stalled', tryPlay);
    videoElement.addEventListener('ended', tryPlay);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('click', handleFirstUserGesture, true);
    document.addEventListener('touchstart', handleFirstUserGesture, true);
    document.addEventListener('keydown', handleFirstUserGesture, true);

    const keepAlive = window.setInterval(() => {
      if (document.visibilityState === 'visible' && videoElement.paused) {
        tryPlay();
      }
    }, 2500);

    tryPlay();

    return () => {
      videoElement.removeEventListener('canplay', tryPlay);
      videoElement.removeEventListener('pause', tryPlay);
      videoElement.removeEventListener('stalled', tryPlay);
      videoElement.removeEventListener('ended', tryPlay);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', handleFirstUserGesture, true);
      document.removeEventListener('touchstart', handleFirstUserGesture, true);
      document.removeEventListener('keydown', handleFirstUserGesture, true);
      window.clearInterval(keepAlive);
    };
  }, [hasHeroVideo, heroMedia?.url, adminMutedVideo]);

  useEffect(() => {
    setVideoLoadFailed(false);
    setIsMuted(true);
    setNeedsUserUnmute(false);
  }, [heroMedia?.url, adminMutedVideo]);

  const handleToggleAudio = async () => {
    const videoElement = videoRef.current;
    if (!videoElement || adminMutedVideo) return;
    if (videoElement.muted) {
      videoElement.muted = false;
      videoElement.volume = 1;
      try {
        await videoElement.play();
      } catch {
        /* ignore */
      }
      setIsMuted(false);
      setNeedsUserUnmute(false);
    } else {
      videoElement.muted = true;
      setIsMuted(true);
    }
  };

  return (
    <section id="about" className="about-section">
      <div className="container">
        <div className="story-header">
          <p className="section-kicker">Our Story</p>
          <h2 className="section-title">How SBU Started</h2>
          <p className="section-subtitle">
            Built from real export-floor experience to give Rwandan growers and exporters reliable access to air cargo space.
          </p>
        </div>

        <div className="story-layout">
          <div className="story-media-card">
            <div className="story-media-frame">
              {hasHeroVideo && !videoLoadFailed ? (
                <>
                  <video
                    ref={videoRef}
                    className="story-video"
                    src={heroMedia.url}
                    poster={airplaneHero}
                    autoPlay
                    muted={adminMutedVideo ? true : isMuted}
                    loop
                    playsInline
                    preload="auto"
                    controls={false}
                    onError={() => setVideoLoadFailed(true)}
                  />
                  {!adminMutedVideo ? (
                    <button
                      type="button"
                      className={`story-audio-toggle${needsUserUnmute ? ' story-audio-toggle--prompt' : ''}`}
                      onClick={handleToggleAudio}
                      aria-label={isMuted ? 'Turn sound on' : 'Mute sound'}
                      title={isMuted ? 'Tap for sound' : 'Mute sound'}
                    >
                      <span aria-hidden="true">{isMuted ? '🔇' : '🔊'}</span>
                      <span className="story-audio-toggle-text">{isMuted ? 'Tap for sound' : 'Sound on'}</span>
                    </button>
                  ) : null}
                </>
              ) : hasHeroImage ? (
                <img src={heroMedia.url} alt="Admin uploaded hero media" className="story-video story-fallback-image" />
              ) : (
                <img src={airplaneHero} alt="Air cargo aircraft" className="story-video story-fallback-image" />
              )}
              <div className="story-media-badge">problem led bespoke platform</div>
            </div>
          </div>

          <div className="story-content-card">
            <div className="story-content-topline">Our story</div>
            <p className="story-intro">
              <strong>SBU Air Cargo</strong> was founded by Justin, a supply chain engineer with hands on experience leading export operations at Souk Farms Ltd, where he built strong relationships with airline cargo teams (RwandAir, ADL/Ethiopian, KLM) and optimized daily shipments to cut conflicts, boost space utilization, and lower spoilage.
            </p>

            <p className="story-block story-problem">
              <strong>The Problem:</strong> Seeing the same pain points across Rwanda's horticulture exporters: Chronic capacity crunch despite available capacity, no-shows wasting allocations, and last-minute disruptions. Justin recognized an opportunity to create lasting change.
            </p>

            <p className="story-block story-solution">
              <strong>The Solution:</strong> Launched SBU Air Cargo Digital Hub in 2026 as a neutral, technology driven platform. We are not a freight forwarder or carrier. Instead, we act as the trusted hub that centralizes requests, publishes airline space availability, enables instant reallocations, and manages coordination so exporters (from smallholders to large players) get fair, efficient access to air cargo.
            </p>

            <p className="story-closing story-result">
              <strong>The Result:</strong> Backed by proven industry relationships and a commitment to transparency, SBU Air Cargo turns Rwanda's existing capacity into a competitive advantage, delivering more produce to global markets, fresher and faster. Exporters have full time focus to streamline the production and packhouse operations while SBU handles air cargo matters.
            </p>

            <div className="story-partners">
              <h4>Trusted Airline Partners</h4>
              <div className="airline-logos">
                <div className="airline-badge">RwandAir</div>
                <div className="airline-badge">Ethiopian Airlines</div>
                <div className="airline-badge">KLM</div>
              </div>
              <p className="partners-note">
                As market grow and get stable SBU intend to approach additional air cargo carriers to increase Rwanda's fresh export capacity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
