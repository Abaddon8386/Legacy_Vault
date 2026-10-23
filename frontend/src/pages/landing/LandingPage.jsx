import { useState, useEffect, useRef } from 'react';
import { ArrowUpRight, ArrowDown, Shield, LockKeyhole, FileText, Users } from 'lucide-react';
import { SUBSCRIPTION_PLANS } from '../../utils/subscriptionPlans.js';
import { isSessionActive } from '../../utils/session.js';
import { observeLandingReveals } from './landingMotion.js';
import './LandingPage.css';

export default function LandingPage({ onLogin, onRegister, onDashboard, session, isRestoringSession = false }) {
  const [lang, setLang] = useState(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'vi'));
  const en = lang === 'en';
  const pageRef = useRef(null);
  useEffect(() => observeLandingReveals(pageRef.current), [lang]);

  const userRoles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const hasValidSession = !isRestoringSession && isSessionActive(session);
  const isDashboardEligible = hasValidSession && (userRoles.includes('VAULT_OWNER') || userRoles.includes('BENEFICIARY'));

  return <div className="lv-landing" ref={pageRef}>
    <header className="lv-landing-nav">
      <a className="lv-landing-brand" href="#top"><Shield size={28} strokeWidth={1.6} /><span>LegacyVault</span></a>
      <nav aria-label={en ? 'Main navigation' : 'Điều hướng chính'}>
        <a href="#features">{en ? 'Your legacy' : 'Không gian di sản'}</a>
        <a href="#how-it-works">{en ? 'How it works' : 'Cách hoạt động'}</a>
        <a href="#plans">{en ? 'Plans' : 'Gói sử dụng'}</a>
      </nav>
      <div className="lv-landing-nav-actions">
        <button type="button" className="lv-landing-language" onClick={() => setLang(en ? 'vi' : 'en')} aria-label={en ? 'Switch to Vietnamese' : 'Chuyển sang tiếng Anh'}>{en ? 'VI' : 'EN'}</button>
        {isRestoringSession ? (
          <span className="lv-landing-auth-loading" aria-live="polite" aria-busy="true">{en ? 'Checking…' : 'Đang kiểm tra…'}</span>
        ) : isDashboardEligible ? (
          <button type="button" className="lv-landing-dashboard" onClick={() => onDashboard?.(lang)}>{en ? 'Dashboard' : 'Bảng điều khiển'}<ArrowUpRight size={16} /></button>
        ) : (
          <>
            <button type="button" className="lv-landing-register" onClick={() => onRegister?.(lang)}>{en ? 'Sign up' : 'Đăng ký'}</button>
            <button type="button" className="lv-landing-login" onClick={() => onLogin?.(lang)}>{en ? 'Sign in' : 'Đăng nhập'}<ArrowUpRight size={16} /></button>
          </>
        )}
      </div>
    </header>
    <main>
      <section className="lv-landing-hero" id="top" aria-labelledby="lv-landing-title">
        <div className="lv-landing-stars" aria-hidden="true" />
        <div className="lv-landing-hero-inner">
          <div className="lv-landing-copy">
            <h1 id="lv-landing-title" data-reveal="up" style={{'--reveal-delay': '80ms'}}>{en ? 'A lifetime of stories' : 'Một đời vun đắp'}<br /><em>{en ? 'A legacy to keep' : 'Một nơi gìn giữ'}</em></h1>
            <p className="lv-landing-description" data-reveal="up" style={{'--reveal-delay': '160ms'}}>{en ? 'Bring your digital assets, documents and wishes together. Thoughtfully organised today, for the people you care about tomorrow.' : 'Sắp xếp tài sản số, lưu giữ tài liệu và những điều muốn gửi gắm. Để những gì bạn trân trọng hôm nay được chuẩn bị chu đáo cho ngày mai.'}</p>
            <button data-reveal="up" style={{'--reveal-delay': '240ms'}} className="lv-landing-primary" disabled={isRestoringSession} onClick={() => (isDashboardEligible ? onDashboard : onRegister)?.(lang)}>{isDashboardEligible ? (en ? 'Dashboard' : 'Bảng điều khiển') : (en ? 'Create your space' : 'Bắt đầu gìn giữ')}<ArrowUpRight size={20} /></button>
          </div>
          <div className="lv-landing-art" data-reveal="scale" style={{'--reveal-delay': '160ms'}}>
            <div className="lv-landing-halo lv-landing-halo--back" aria-hidden="true"><span className="lv-landing-halo-track" /></div>
            <div className="lv-landing-orbit" aria-hidden="true" />
            <div className="lv-landing-scene" aria-hidden="true">
              <div className="lv-landing-float">
                <div className="lv-landing-cube">
                  {['front', 'back', 'left', 'right', 'top', 'bottom'].map(face => <div key={face} className={'lv-landing-face lv-landing-face--' + face}>
                    <span className="lv-landing-corner c1" /><span className="lv-landing-corner c2" /><span className="lv-landing-corner c3" /><span className="lv-landing-corner c4" />
                    {(face === 'front' || face === 'back') ? <><div className="lv-landing-vault-emblem"><Shield strokeWidth={1} /><LockKeyhole className="lv-landing-key" strokeWidth={1.4} /></div><span className="lv-landing-engraving">LEGACYVAULT</span><span className="lv-landing-hinge h1" /><span className="lv-landing-hinge h2" /></> : <div className="lv-landing-face-lines" />}
                  </div>)}
                </div>
              </div>
            </div>
            <div className="lv-landing-halo lv-landing-halo--front" aria-hidden="true"><span className="lv-landing-halo-track" /></div>
          </div>
        </div>
        <a data-reveal="up" className="lv-landing-explore" href="#features"><ArrowDown size={15} />{en ? 'Explore your space' : 'Khám phá không gian của bạn'}</a>
      </section>
      <section className="lv-landing-section" id="features">
        <h2 data-reveal="up" style={{'--reveal-delay': '80ms'}}><span>{en ? 'More than files' : 'Không chỉ là tài liệu'}</span>{' '}<em>{en ? 'A part of your life' : 'Là một phần cuộc sống'}</em></h2>
        <div className="lv-landing-features">
          {[
            [LockKeyhole, en ? 'A personal vault' : 'Kho di sản riêng', en ? 'Organise digital assets and the information that belongs with them.' : 'Sắp xếp tài sản số và những thông tin cần được lưu giữ cùng chúng.'],
            [FileText, en ? 'Documents, in order' : 'Hồ sơ có trật tự', en ? 'Keep digitised documents and their version history together.' : 'Lưu bản số hóa tài liệu và theo dõi lịch sử từng phiên bản.'],
            [Users, en ? 'The people who matter' : 'Những người bạn tin cậy', en ? 'Record beneficiaries and trusted contacts as part of your plan.' : 'Khai báo người thụ hưởng và người liên hệ tin cậy trong kế hoạch di sản.'],
          ].map(([Icon, title, description], i) => <article key={title} data-reveal="up" style={{'--reveal-delay': `${i * 100}ms`}}><span className="lv-landing-feature-index">0{i + 1}</span><Icon size={25} strokeWidth={1.4} /><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>
      <section className="lv-landing-how lv-landing-section" id="how-it-works">
        <div><h2 data-reveal="up" style={{'--reveal-delay': '80ms'}}><span>{en ? 'Prepare today' : 'Chuẩn bị hôm nay'}</span>{' '}<em>{en ? 'With care' : 'Bằng sự chu đáo'}</em></h2></div>
        <ol>{(en ? ['Create an account and your personal vault.', 'Add assets, documents and trusted contacts.', 'Set your activity check-in schedule.'] : ['Tạo tài khoản và khởi tạo kho di sản riêng.', 'Thêm tài sản, tài liệu và người liên hệ tin cậy.', 'Thiết lập lịch xác nhận hoạt động định kỳ.']).map((step, i) => <li key={step} data-reveal="left" style={{'--reveal-delay': `${i * 100}ms`}}><span>0{i + 1}</span>{step}</li>)}</ol>
      </section>
      <section className="lv-landing-section" id="plans">
        <h2 data-reveal="up" style={{'--reveal-delay': '80ms'}}><span>{en ? 'One vault' : 'Một kho di sản'}</span>{' '}<em>{en ? 'Space to grow' : 'Không gian để tiếp nối'}</em></h2>
        <div className="lv-landing-plans">{SUBSCRIPTION_PLANS.map((plan, i) => <article key={plan.code} data-reveal="up" style={{'--reveal-delay': `${i * 100}ms`}}><h3>{en ? plan.nameEn : plan.nameVi}</h3><p className="lv-landing-price">{en ? plan.priceEn : plan.priceVi}</p><p>{plan.maxAssets} {en ? 'assets' : 'tài sản'}<br />{plan.code === 'BASIC' ? '100 MB' : plan.code === 'STANDARD' ? '1 GB' : '5 GB'} {en ? 'document storage' : 'lưu trữ tài liệu'}</p></article>)}</div>
        <button data-reveal="up" className="lv-landing-end-cta" disabled={isRestoringSession} onClick={() => (isDashboardEligible ? onDashboard : onRegister)?.(lang)}>{isDashboardEligible ? (en ? 'Dashboard' : 'Bảng điều khiển') : (en ? 'Create an account' : 'Tạo tài khoản')}<ArrowUpRight size={18} /></button>
      </section>
    </main>
    <footer className="lv-landing-footer" data-reveal="up"><span>LegacyVault</span><span>© 2026</span></footer>
  </div>;
}
