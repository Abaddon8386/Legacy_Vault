import { useState } from 'react';
import { ArrowUpRight, ArrowDown, Shield, LockKeyhole, FileText, Users } from 'lucide-react';
import { SUBSCRIPTION_PLANS } from '../../utils/subscriptionPlans.js';
import { isSessionActive } from '../../utils/session.js';
import './LandingPage.css';

export default function LandingPage({ onLogin, onRegister, onDashboard, session, isRestoringSession = false }) {
  const [lang, setLang] = useState(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'vi'));
  const en = lang === 'en';

  const userRoles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const hasValidSession = !isRestoringSession && isSessionActive(session);
  const isDashboardEligible = hasValidSession && (userRoles.includes('VAULT_OWNER') || userRoles.includes('BENEFICIARY'));

  return <div className="lv-landing">
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
            <p className="lv-landing-eyebrow"><span />{en ? 'A PLACE FOR WHAT MATTERS' : 'DÀNH CHỖ CHO NHỮNG ĐIỀU QUÝ GIÁ'}</p>
            <h1 id="lv-landing-title">{en ? 'A lifetime of stories.' : 'Một đời vun đắp.'}<br /><em>{en ? 'A legacy to keep.' : 'Một nơi gìn giữ.'}</em></h1>
            <p className="lv-landing-description">{en ? 'Bring your digital assets, documents and wishes together. Thoughtfully organised today, for the people you care about tomorrow.' : 'Sắp xếp tài sản số, lưu giữ tài liệu và những điều muốn gửi gắm. Để những gì bạn trân trọng hôm nay được chuẩn bị chu đáo cho ngày mai.'}</p>
            <button className="lv-landing-primary" onClick={onRegister}>{en ? 'Create your space' : 'Bắt đầu gìn giữ'}<ArrowUpRight size={20} /></button>
            <p className="lv-landing-small">{en ? 'Start with the free Basic plan. One vault, through every chapter.' : 'Bắt đầu với gói Cơ bản miễn phí. Một kho, đồng hành qua từng chặng đời.'}</p>
          </div>
          <div className="lv-landing-art">
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
            <div className="lv-landing-art-footer"><span>{en ? 'YOUR PRIVATE LEGACY' : 'KHÔNG GIAN DI SẢN CỦA BẠN'}</span></div>
          </div>
        </div>
        <a className="lv-landing-explore" href="#features"><ArrowDown size={15} />{en ? 'Explore your space' : 'Khám phá không gian của bạn'}</a>
      </section>
      <section className="lv-landing-section" id="features">
        <p className="lv-landing-kicker">{en ? 'KEEP WHAT MATTERS, TOGETHER' : 'NHỮNG ĐIỀU QUAN TRỌNG, CÙNG MỘT NƠI'}</p>
        <h2>{en ? 'More than files. A part of your life.' : 'Không chỉ là tài liệu. Là một phần cuộc sống.'}</h2>
        <div className="lv-landing-features">
          {[
            [LockKeyhole, en ? 'A personal vault' : 'Kho di sản riêng', en ? 'Organise digital assets and the information that belongs with them.' : 'Sắp xếp tài sản số và những thông tin cần được lưu giữ cùng chúng.'],
            [FileText, en ? 'Documents, in order' : 'Hồ sơ có trật tự', en ? 'Keep digitised documents and their version history together.' : 'Lưu bản số hóa tài liệu và theo dõi lịch sử từng phiên bản.'],
            [Users, en ? 'The people who matter' : 'Những người bạn tin cậy', en ? 'Record beneficiaries and trusted contacts as part of your plan.' : 'Khai báo người thụ hưởng và người liên hệ tin cậy trong kế hoạch di sản.'],
          ].map(([Icon, title, description], i) => <article key={title}><span className="lv-landing-feature-index">0{i + 1}</span><Icon size={25} strokeWidth={1.4} /><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>
      <section className="lv-landing-how lv-landing-section" id="how-it-works">
        <div><p className="lv-landing-kicker">{en ? 'START WITH A SMALL STEP' : 'BẮT ĐẦU TỪ MỘT BƯỚC NHỎ'}</p><h2>{en ? 'Prepare today. With care.' : 'Chuẩn bị hôm nay. Bằng sự chu đáo.'}</h2></div>
        <ol>{(en ? ['Create an account and your personal vault.', 'Add assets, documents and trusted contacts.', 'Set your activity check-in schedule.'] : ['Tạo tài khoản và khởi tạo kho di sản riêng.', 'Thêm tài sản, tài liệu và người liên hệ tin cậy.', 'Thiết lập lịch xác nhận hoạt động định kỳ.']).map((step, i) => <li key={step}><span>0{i + 1}</span>{step}</li>)}</ol>
        <p className="lv-landing-legal-note">{en ? 'Digitised documents support record keeping. Original documents and the applicable verification process are still required.' : 'Bản số hóa hỗ trợ lưu trữ hồ sơ. Giấy tờ bản cứng và quy trình xác minh tương ứng vẫn cần được thực hiện.'}</p>
      </section>
      <section className="lv-landing-section" id="plans">
        <p className="lv-landing-kicker">{en ? 'ROOM FOR YOUR LEGACY' : 'THÊM KHÔNG GIAN CHO DI SẢN'}</p><h2>{en ? 'One vault. Space to grow.' : 'Một kho di sản. Không gian để tiếp nối.'}</h2>
        <p className="lv-landing-plan-note">{en ? 'Proposed plans for reference. Activation and billing are not available yet.' : 'Các gói đề xuất để tham khảo. Hiện chưa mở kích hoạt và thanh toán.'}</p>
        <div className="lv-landing-plans">{SUBSCRIPTION_PLANS.map(plan => <article key={plan.code}><h3>{en ? plan.nameEn : plan.nameVi}</h3><p className="lv-landing-price">{en ? plan.priceEn : plan.priceVi}</p><p>{plan.maxAssets} {en ? 'assets' : 'tài sản'}<br />{plan.code === 'BASIC' ? '100 MB' : plan.code === 'STANDARD' ? '1 GB' : '5 GB'} {en ? 'document storage' : 'lưu trữ tài liệu'}</p></article>)}</div>
        <p className="lv-landing-plan-note">{en ? 'Every plan includes one vault for the lifetime of your account. No online payment is collected here.' : 'Mọi gói đều áp dụng một kho trong suốt vòng đời tài khoản. Trang này chưa tiếp nhận thanh toán trực tuyến.'}</p>
        <button className="lv-landing-end-cta" onClick={onRegister}>{en ? 'Create an account' : 'Tạo tài khoản'}<ArrowUpRight size={18} /></button>
      </section>
    </main>
    <footer className="lv-landing-footer"><span>LegacyVault</span><p>{en ? 'For the chapters that follow.' : 'Gìn giữ hôm nay, trao gửi mai sau.'}</p><span>© 2026</span></footer>
  </div>;
}
