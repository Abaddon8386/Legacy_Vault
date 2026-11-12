import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { liveCaseLinkActions, liveCounterLinkActions } from './utils/caseLinkService.js'
import { liveDmsGraceActions } from './utils/dmsService.js'
import SessionExpiryNotice from './components/common/SessionExpiryNotice.jsx'
import { installPressFeedback } from './utils/pressFeedback.js'

/**
 * Điểm vào của ứng dụng React: bật hiệu ứng phản hồi khi nhấn (installPressFeedback), rồi render {@code <App>}
 * với các action thật cho liên kết hồ sơ ({@code liveCaseLinkActions}, {@code liveCounterLinkActions}) và gia hạn DMS
 * ({@code liveDmsGraceActions}), cùng {@code SessionExpiryNotice} (thông báo sắp hết phiên) vào phần tử {@code #root}.
 * Các action được truyền qua props để test có thể thay bằng bản giả.
 */
installPressFeedback()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App caseLinkActions={liveCaseLinkActions} counterLinkActions={liveCounterLinkActions} dmsGraceActions={liveDmsGraceActions} />
    <SessionExpiryNotice />
  </StrictMode>,
)
