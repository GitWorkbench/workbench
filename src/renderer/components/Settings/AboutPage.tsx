import React from 'react';
import { ArrowUpRight, BookOpen, Github, MessageSquare, Scale, UserRound } from 'lucide-react';
import { AppLogo } from '../Common/AppLogo';
import { PROJECT_REPOSITORY, PROJECT_URL } from '../../../shared/appIdentity';
import './about.css';

interface AboutPageProps {
  installedVersion: string;
  onExplore: () => void;
  children: React.ReactNode;
}

export function AboutPage({ installedVersion, onExplore, children }: AboutPageProps) {
  return (
    <div className="about-page">
      <header className="about-heading">
        <h2>About Git Workbench</h2>
        <p>Your workspace for a clearer view of Git.</p>
      </header>

      <section className="about-card about-product" aria-label="Git Workbench overview">
        <div className="about-brand">
          <AppLogo size={56} />
          <div className="about-brand-copy">
            <div className="about-product-title">
              <h3>Git <span>Workbench</span></h3>
              <span className="about-version">Version {installedVersion}</span>
            </div>
            <p>A visual Git workspace for understanding history, reviewing changes, and managing repositories.</p>
          </div>
        </div>
        <div className="about-product-meta">
          <span>Linux · macOS · Windows</span>
          <span>Open source · MIT license</span>
        </div>
        <div className="about-product-actions">
          <a className="btn-secondary" href={PROJECT_URL} target="_blank" rel="noopener noreferrer">
            <Github size={14} aria-hidden="true" />
            View on GitHub
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
          <button type="button" className="btn-secondary" onClick={onExplore}>
            <BookOpen size={14} aria-hidden="true" />
            Explore Git Workbench
          </button>
        </div>
      </section>

      {children}

      <div className="about-details-grid">
        <section className="about-card" aria-labelledby="about-developer-title">
          <div className="about-card-heading">
            <UserRound size={16} aria-hidden="true" />
            <h3 id="about-developer-title">Developer</h3>
          </div>
          <p className="about-developer-name">Naowas Morshed Eimon</p>
          <p className="about-description">Creator and maintainer of Git Workbench.</p>
          <a className="about-profile-link" href="https://github.com/naowas" target="_blank" rel="noopener noreferrer">
            <Github size={14} aria-hidden="true" />
            @naowas
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </section>

        <section className="about-card" aria-labelledby="about-project-title">
          <div className="about-card-heading">
            <Github size={16} aria-hidden="true" />
            <h3 id="about-project-title">Project &amp; support</h3>
          </div>
          <p className="about-description">Contributions, bug reports, and feature ideas are welcome on GitHub.</p>
          <div className="about-resource-links">
            <a href={PROJECT_URL} target="_blank" rel="noopener noreferrer">
              <Github size={14} aria-hidden="true" />
              <span>{PROJECT_REPOSITORY}</span>
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <a href={`${PROJECT_URL}/issues`} target="_blank" rel="noopener noreferrer">
              <MessageSquare size={14} aria-hidden="true" />
              <span>Report an issue or request a feature</span>
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <a href={`${PROJECT_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
              <Scale size={14} aria-hidden="true" />
              <span>MIT license</span>
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>

      <footer className="about-footer">© 2026 Git Workbench Contributors. Released under the MIT License.</footer>
    </div>
  );
}
