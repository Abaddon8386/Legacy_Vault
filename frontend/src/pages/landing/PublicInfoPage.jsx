import { useEffect, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronDown, LifeBuoy, LockKeyhole, Shield } from 'lucide-react';
import { publicInfoContent } from './publicInfoContent.js';
import './PublicInfoPage.css';

const emblems = { support: LifeBuoy, privacy: LockKeyhole, about: BookOpen };

function subscribeToHash(onChange) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = () => window.location.hash;

export default function PublicInfoPage({ page, lang }) {
  const copy = publicInfoContent[lang];
  const info = copy[page];
  const oppositeLang = lang === 'en' ? 'vi' : 'en';
  const hash = useSyncExternalStore(subscribeToHash, getHash);
  const href = path => `${path}?lang=${lang}`;
  const Emblem = emblems[page];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${info.title} | LegacyVault`;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView?.();
    return () => { document.title = previousTitle; };
  }, [info.title]);

  return (
    <div className="lv-public-info" lang={lang}>
      <header className="lv-public-info__masthead">
        <div className="lv-public-info__container lv-public-info__masthead-inner">
          <a className="lv-public-info__brand" href={href('/')}><Shield size={26} strokeWidth={1.6} aria-hidden="true" /> LegacyVault</a>
          <a className="lv-public-info__language" href={`/${page}?lang=${oppositeLang}${hash}`} aria-label={copy.switchLanguage}>
            {oppositeLang.toUpperCase()}
          </a>
        </div>
      </header>
      <main>
        <div className="lv-public-info__hero">
          <div className="lv-public-info__container lv-public-info__hero-inner">
            <div>
              <a className="lv-public-info__back" href={href('/')}><ArrowLeft size={17} aria-hidden="true" />{copy.home}</a>
              <h1>{info.title}</h1>
              <p>{info.intro}</p>
            </div>
            <div className="lv-public-info__seal" aria-hidden="true"><Emblem size={52} strokeWidth={1.2} /></div>
          </div>
        </div>
        <div className="lv-public-info__container lv-public-info__body">
          <nav className="lv-public-info__index" aria-label={copy.contents}>
            <h2>{copy.contents}</h2>
            <ul>
              {info.sections.map(({ id, title }) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}
            </ul>
          </nav>
          <div className="lv-public-info__content">
            {info.notice && <p className="lv-public-info__notice">{info.notice}</p>}
            {info.sections.map(({ id, title, paragraphs, items, action }) => (
              <section key={id} id={id} aria-labelledby={`${id}-title`} tabIndex={-1}>
                <h2 id={`${id}-title`}>{title}</h2>
                {paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                {items && (
                  <div className="lv-public-info__questions">
                    {items.map(([question, answer]) => (
                      <details key={question}>
                        <summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary>
                        <p>{answer}</p>
                      </details>
                    ))}
                  </div>
                )}
                {action && <a className="lv-public-info__action" href={href(action[0])}>{action[1]} <ArrowUpRight size={16} aria-hidden="true" /></a>}
              </section>
            ))}
            <a className="lv-public-info__related" href={href(info.related[1])}>
              {info.related[0]} <ArrowUpRight size={19} aria-hidden="true" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
