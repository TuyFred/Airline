import React, { useEffect, useMemo, useState } from 'react';
import airplaneHero from '../assets/rwandair-real-hero.jpg';
import '../styles/HeroBanner.css';

export default function HeroBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = useMemo(
    () => [
      {
        id: 'hero-1',
        src: '/destination.png',
        alt: 'Kigali Convention Centre destination view'
      },
      {
        id: 'hero-2',
        src: '/rondpoint.jpg',
        alt: 'Kigali roundabout and skyline view'
      },
      {
        id: 'hero-3',
        src: airplaneHero,
        alt: 'RwandAir cargo aircraft flying above clouds'
      },
      {
        id: 'hero-4',
        src: '/image.jpg',
        alt: 'Commercial aircraft on white background'
      }
    ],
    []
  );

  useEffect(() => {
    if (slides.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    if (currentSlide >= slides.length) {
      setCurrentSlide(0);
    }
  }, [currentSlide, slides.length]);

  const showPrev = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  return (
    <section className="hero-banner">
      <div className="hero-background">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`hero-slide ${index === currentSlide ? 'active' : ''}`}
            style={{ backgroundImage: `url(${slide.src})` }}
            role="img"
            aria-label={slide.alt}
          />
        ))}
        <div className="hero-gradient"></div>
        <div className="hero-grain-overlay" aria-hidden="true"></div>
      </div>

      <button type="button" className="hero-arrow hero-arrow-left" onClick={showPrev} aria-label="Previous slide">
        &#10094;
      </button>

      <button type="button" className="hero-arrow hero-arrow-right" onClick={showNext} aria-label="Next slide">
        &#10095;
      </button>

      <div className="hero-content">
        <div className="hero-text">
          <div className="hero-badge">SBU AIR CARGO Space access digital hub</div>
          <h1 className="hero-title">Fly Cargo Direct With Confidence</h1>
          <p className="hero-subtitle">
            Plan faster, secure enough space early, and keep your shipments on schedule
          </p>

          <div className="hero-actions">
            <button className="hero-primary-btn" onClick={() => { window.location.hash = '#login'; }}>Book Now</button>
          </div>

          <div className="hero-slide-dots" aria-label="Hero background slide controls">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={`hero-dot ${index === currentSlide ? 'active' : ''}`}
                onClick={() => setCurrentSlide(index)}
                aria-label={`Show background slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
