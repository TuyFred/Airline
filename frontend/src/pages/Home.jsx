import React from 'react';
import '../styles/Home.css';
import Header from '../components/Header';
import MaintenanceBanner from '../components/MaintenanceBanner';
import HeroBanner from '../components/HeroBanner';
import VisionMission from '../components/VisionMission';
import AboutUs from '../components/AboutUs';
import OurServices from '../components/OurServices';
import OurCustomers from '../components/OurCustomers';
import Footer from '../components/Footer';

export default function Home({ maintenanceMessage = '' }) {
  return (
    <div className="home-page">
      <MaintenanceBanner message={maintenanceMessage} />
      <Header />
      <HeroBanner />
      <VisionMission />
      <AboutUs />
      <OurServices />
      <OurCustomers />
      <Footer />
    </div>
  );
}
