import React from 'react';
import '../styles/Footer.css';

const footerWhatsappMessage = encodeURIComponent(
  'Hi, I need assistance with space booking.'
);

export default function Footer() {
  return (
    <footer id="contact" className="footer">
      <div className="footer-main">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>SBU Export Coordination Hub</h4>
              <p className="footer-tagline">Rwanda's Leading Air Cargo Platform</p>
              <p className="footer-description">
                Empowering Rwanda's fresh-produce exporters with real-time air cargo coordination, transparent airline partnerships, and sustainable growth.
              </p>
              <div className="social-links">
                <a href="#" className="social-icon">f</a>
                <a href="#" className="social-icon">𝕏</a>
                <a href="#" className="social-icon">in</a>
              </div>
            </div>

            <div className="footer-section">
              <h5>Quick Links</h5>
              <ul>
                <li><a href="#about">About Us</a></li>
                <li><a href="#services">Our Services</a></li>
                <li><a href="#availability">Space Availability</a></li>
                <li><a href="#bookings">Bookings</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
            </div>

            <div className="footer-section">
              <h5>For Exporters</h5>
              <ul>
                <li><a href="#login">Exporter Login</a></li>
                <li><a href="#signup">Create Account</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="#faq">FAQ</a></li>
                <li><a href="#support">Support</a></li>
              </ul>
            </div>

            <div className="footer-section contact-info">
              <h5>Contact Us</h5>
              <div className="contact-item">
                <strong>📍 Office Address</strong>
                <p>
                  SBU Export Coordination Hub<br />
                  Rwanda Business District<br />
                  Kigali, Rwanda
                </p>
              </div>
              <div className="contact-item">
                <strong>📧 Email</strong>
                <a href="mailto:justin@sbuexport.com">justin@sbuexport.com</a>
              </div>
              <div className="contact-item">
                <strong>💬 WhatsApp</strong>
                <a href={`https://wa.me/250782519559?text=${footerWhatsappMessage}`} target="_blank" rel="noopener noreferrer" className="whatsapp-btn">
                  Chat with us on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container">
          <p className="copyright">
            © 2026 CyberFred. All rights reserved.
          </p>
          <div className="footer-links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#disclaimer">Disclaimer</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
