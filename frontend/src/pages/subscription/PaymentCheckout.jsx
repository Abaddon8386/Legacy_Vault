import { useEffect, useRef, useState } from 'react';
import { paymentCatalog, paymentQuote, createPayment, readPayment } from '../../utils/paymentService.js';
import { Button } from '../../components/common/Button.jsx';
import './PaymentCheckout.css';

export default function PaymentCheckout({ accessToken, lang, currentPlan, onPaid }) {
  const [plans, setPlans] = useState([]);
  const [selection, setSelection] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requestKey = useRef(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const en = lang === 'en';
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    paymentCatalog({ accessToken, signal: controller.signal }).then(setPlans).catch(() => {});
    return () => { alive.current = false; controller.abort(); };
  }, [accessToken]);
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('vnp_TxnRef');
    if (!reference) return;
    const id = reference.replace(/^([a-f0-9]{8})([a-f0-9]{4})([a-f0-9]{4})([a-f0-9]{4})([a-f0-9]{12})$/i, '$1-$2-$3-$4-$5');
    const controller = new AbortController();
    let timer, attempts = 0;
    const check = async () => {
      try {
        const p = await readPayment(id, { accessToken, signal: controller.signal });
        if (controller.signal.aborted) return;
        const labels = en
          ? { SUCCEEDED: 'Payment verified. Your plan is active.', FAILED: 'Payment failed. Your plan has not changed.',
            PENDING: 'Waiting for VNPay confirmation. You can refresh this page.', EXPIRED: 'Checkout expired. Any delayed confirmation will be processed by the server.' }
          : { SUCCEEDED: 'Đã xác nhận thanh toán và kích hoạt gói.', FAILED: 'Thanh toán thất bại. Gói chưa thay đổi.',
            PENDING: 'Đang chờ VNPay xác nhận. Bạn có thể tải lại trang.', EXPIRED: 'Liên kết thanh toán đã hết hạn. Backend vẫn xử lý xác nhận đến muộn.' };
        setMessage(labels[p.status]);
        if (p.status === 'SUCCEEDED') {
          const url = new URL(window.location.href);
          for (const key of [...url.searchParams.keys()]) if (key.startsWith('vnp_')) url.searchParams.delete(key);
          window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
          onPaid();
        }
        else if (['PENDING', 'EXPIRED'].includes(p.status) && ++attempts < 20) timer = setTimeout(check, 3000);
      } catch (error) {
        if (error.name !== 'AbortError') setMessage(en ? 'Unable to verify payment. Please refresh.' : 'Chưa kiểm tra được thanh toán. Vui lòng tải lại trang.');
      }
    };
    check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [accessToken, en, onPaid]);
  const fail = error => {
    const code = error?.code;
    setMessage(code === 'SUBSCRIPTION_UPGRADE_UNAVAILABLE'
      ? (en ? 'VNPay sandbox is not configured yet.' : 'VNPay sandbox chưa được cấu hình.')
      : code === 'PAYMENT_REQUEST_CONFLICT'
        ? (en ? 'A checkout is already pending. Retry it or wait 15 minutes.' : 'Đang có giao dịch chờ. Hãy thử lại giao dịch đó hoặc đợi 15 phút.')
        : (en ? 'Unable to start payment. Refresh the catalog or retry.' : 'Chưa tạo được thanh toán. Hãy tải lại bảng giá hoặc thử lại.'));
  };
  const choose = async plan => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const quote = await paymentQuote(plan, { accessToken });
      if (!alive.current) return;
      if (!quote.paymentAvailable) { fail({ code: 'SUBSCRIPTION_UPGRADE_UNAVAILABLE' }); return; }
      setSelection(plan);
      // Preserve the key after a network failure; retry cannot create another chargeable order.
      if (requestKey.current?.plan !== plan.code) requestKey.current = { plan: plan.code, key: crypto.randomUUID() };
    } catch (error) { if (alive.current) fail(error); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  const pay = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const url = await createPayment(selection, requestKey.current.key, { accessToken });
      if (alive.current) window.location.assign(url);
    } catch (error) { if (alive.current) fail(error); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  const tier = ['BASIC', 'STANDARD', 'EXTENDED'];
  const planName = code => ({ BASIC: en ? 'Basic' : 'Cơ bản', STANDARD: en ? 'Standard' : 'Tiêu chuẩn', EXTENDED: en ? 'Extended' : 'Mở rộng' }[code] || code);
  return <section className="lv-payment-checkout" aria-label={en ? 'Buy a lifetime plan' : 'Mua gói trọn đời'} aria-busy={busy}>
    <h2>{en ? 'Buy once, use for life' : 'Mua một lần, dùng trọn đời'}</h2>
    <p>{en ? 'Free remains available. Upgrades cost the full target price. Payment takes place at VNPay sandbox.'
      : 'Gói Free vẫn miễn phí. Nâng cấp trả đủ giá gói đích. Thanh toán tại VNPay sandbox.'}</p>
    <div className="lv-payment-checkout__actions">
      {plans.filter(p => tier.indexOf(p.code) > tier.indexOf(currentPlan)).map(plan => <Button
        key={plan.code} type="button" disabled={busy} onClick={() => choose(plan)}>
        {en ? 'Upgrade to' : 'Nâng cấp lên'} {planName(plan.code)} · {plan.priceVnd.toLocaleString(en ? 'en-US' : 'vi-VN')} VND
      </Button>)}
    </div>
    {selection && <div className="lv-payment-checkout__confirmation" role="group" aria-label={en ? 'Confirm purchase' : 'Xác nhận mua gói'}>
      <h3>{en ? 'Confirm purchase' : 'Xác nhận mua gói'}</h3>
      <p>{planName(selection.code)}: <strong>{selection.priceVnd.toLocaleString(en ? 'en-US' : 'vi-VN')} VND</strong> — {en ? 'one-time payment, no recurring charge' : 'trả một lần, không tự động gia hạn'}</p>
      <Button type="button" isLoading={busy} onClick={pay}>{en ? 'Continue to VNPay' : 'Tiếp tục đến VNPay'}</Button>
    </div>}
    {message && <p className="lv-payment-checkout__message" role="status">{message}</p>}
  </section>;
}
