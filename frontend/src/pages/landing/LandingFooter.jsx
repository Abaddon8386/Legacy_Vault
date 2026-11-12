import { Shield } from 'lucide-react';
import { publicInfoContent } from './publicInfoContent.js';

/**
 * Chân trang của trang chủ công khai: logo, các nhóm liên kết (sản phẩm, tài nguyên, bảo mật, về LegacyVault) trỏ tới các mục trên trang chủ
 * và các trang `/support`, `/privacy`, `/about` (render bởi `PublicInfoPage`) kèm `?lang=`. Không gọi API.
 *
 * @param {object} props
 * @param {'vi'|'en'} props.lang Ngôn ngữ.
 */
export default function LandingFooter({ lang }) {
  const en = lang === 'en';
  const support = `/support?lang=${lang}`;
  const privacy = `/privacy?lang=${lang}`;
  const groups = [
    {
      title: en ? 'Product' : 'Sản phẩm',
      links: [
        ['#features', en ? 'Digital vault' : 'Kho di sản số'],
        ['#how-it-works', en ? 'How it works' : 'Cách hoạt động'],
        ['#plans', en ? 'Plans and pricing' : 'Gói sử dụng'],
      ],
    },
    {
      title: en ? 'Resources' : 'Tài nguyên',
      links: [
        [support, en ? 'Help & Support' : 'Trợ giúp và hỗ trợ'],
        [`${support}#faq`, en ? 'Frequently asked questions' : 'Câu hỏi thường gặp'],
        [`${support}#beneficiaries`, en ? 'Guide for beneficiaries' : 'Hướng dẫn người thụ hưởng'],
      ],
    },
    {
      title: en ? 'Security' : 'Bảo mật',
      links: [
        [`${privacy}#protection`, en ? 'Data protection' : 'Bảo mật dữ liệu'],
        [`${privacy}#access`, en ? 'Access permissions' : 'Quyền truy cập'],
        [`${privacy}#account-safety`, en ? 'Account safety' : 'Bảo vệ tài khoản'],
      ],
    },
    {
      title: 'LegacyVault',
      links: [
        [`/about?lang=${lang}`, en ? 'About LegacyVault' : 'Về LegacyVault'],
        [`${support}#contact`, en ? 'Help with a case' : 'Hỗ trợ hồ sơ'],
      ],
    },
  ];

  return (
    <footer id="site-footer" className="lv-landing-footer">
      <div className="lv-landing-footer-inner">
        <div className="lv-landing-footer-brand">
          <a href="#top"><Shield size={28} strokeWidth={1.6} aria-hidden="true" />LegacyVault</a>
          <p>{en ? 'A home for your digital legacy.' : 'Nơi lưu giữ di sản số của bạn.'}</p>
        </div>
        <nav className="lv-landing-footer-nav" aria-label={en ? 'Footer navigation' : 'Điều hướng chân trang'}>
          {groups.map(({ title, links }) => (
            <div key={title}>
              <h2>{title}</h2>
              <ul>{links.map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}</ul>
            </div>
          ))}
        </nav>
        <div className="lv-landing-footer-bottom">
          <small>© 2026 LegacyVault</small>
          <a href={privacy}>{publicInfoContent[lang].privacy.title}</a>
        </div>
      </div>
    </footer>
  );
}
