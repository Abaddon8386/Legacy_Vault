import RelatedPersonEditDialog from './RelatedPersonEditDialog.jsx';
import { useState, useEffect, useRef } from 'react';
import {
  getTrustees,
  createTrustee,
  getBeneficiaries,
  createBeneficiary,
  checkConfigurationReadiness,
} from '../../utils/trusteeBeneficiaryService.js';
import { validateTrustee } from '../../utils/trusteeValidation.js';
import { validateBeneficiary } from '../../utils/beneficiaryValidation.js';
import './TrusteeBeneficiaryPage.css';

const i18n = {
  vi: {
    brandName: 'LegacyVault',
    eyebrow: 'THIẾT LẬP BẢO VỆ & DI SẢN',
    pageTitle: 'Người thụ hưởng & Người thi hành bên ngoài',
    pageDesc:
      'Cấu hình phân quyền bàn giao di sản số bảo mật, rõ ràng và tuân thủ chặt chẽ pháp lý.',
    navBack: '← Quay lại',
    navToLogin: 'Đăng nhập',
    navToRegister: 'Đăng ký',

    // Readiness Banner
    readinessTitle: 'Điều kiện cấu hình kho',
    statusReady: 'Đã sẵn sàng cấu hình',
    statusPending: 'Chưa đủ điều kiện',
    readyMsg: 'Đã đủ điều kiện: Có ít nhất 1 Người thụ hưởng trong hệ thống.',
    pendingMsg: 'Cần có ít nhất 1 Người thụ hưởng để hoàn tất cấu hình kho.',
    beneficiaryCountLabel: 'Người thụ hưởng:',
    trusteeStatusLabel: 'Người thi hành bên ngoài:',
    trusteeConfigured: 'Đã chỉ định',
    trusteeSkipped: 'Đã bỏ qua (Tùy chọn)',
    trusteeUnconfigured: 'Chưa thiết lập (Tùy chọn)',

    // Section A: Trustee
    trusteeTag: 'TÙY CHỌN',
    trusteeTitle: '2. Người thi hành bên ngoài (Trustee)',
    trusteeSubtitle:
      'Người hỗ trợ kích hoạt quy trình chuyển giao di sản số khi xảy ra biến cố.',
    trusteeNotice:
      'Người thi hành bên ngoài là tùy chọn. Bạn có thể bỏ qua bước này. Người thi hành bên ngoài KHÔNG cần tài khoản, KHÔNG có quyền mở khóa, giải mã hay xem bí mật, và KHÔNG mặc nhiên là Người thụ hưởng. Mỗi két chỉ có tối đa 1 Người thi hành bên ngoài được chỉ định.',
    trusteeSkippedBadge: 'Đã bỏ qua Người thi hành bên ngoài',
    trusteeSkippedDesc:
      'Bạn đã chọn không chỉ định Người thi hành bên ngoài cho két này. Bạn có thể thiết lập bất cứ lúc nào nếu đổi ý.',
    unskipTrusteeBtn: 'Thiết lập Người thi hành bên ngoài',
    skipTrusteeBtn: 'Bỏ qua Người thi hành bên ngoài',
    maxTrusteeReachedNotice:
      'Két đã có 1 Người thi hành bên ngoài được chỉ định (Đã đạt giới hạn tối đa 1 Người thi hành bên ngoài trên mỗi két).',
    duplicateTrusteeError:
      'Két đã có Người thi hành bên ngoài được chỉ định. Mỗi két chỉ có tối đa 1 Người thi hành bên ngoài hiện tại.',
    vaultNotEditableError:
      'Két đang ở trạng thái không thể chỉnh sửa.',

    // Section B: Beneficiary
    beneficiaryTag: 'CẦN ÍT NHẤT MỘT NGƯỜI',
    beneficiaryTitle: '1. Người thụ hưởng (Beneficiary)',
    beneficiarySubtitle:
      'Người được chỉ định nhận thông tin và di sản sau khi quy trình chuyển giao được kích hoạt hợp lệ.',
    beneficiaryNotice:
      'Cần ít nhất 1 Người thụ hưởng để hoàn tất cấu hình. Người thụ hưởng KHÔNG cần tài khoản, hệ thống KHÔNG tạo tài khoản người dùng, KHÔNG cấp liên kết nhận quyền (Claim Link), KHÔNG tạo Cổng khách (Guest Portal) hay mã OTP, và KHÔNG phân bổ tỷ lệ phần trăm chia tài sản tại bước này.',
    noBeneficiaries:
      'Chưa có Người thụ hưởng nào được thêm. Vui lòng thêm ít nhất 1 Người thụ hưởng bên dưới.',
    beneficiaryListTitle: 'Danh sách Người thụ hưởng hiện tại:',

    // Form fields
    fullNameLabel: 'Họ và tên',
    fullNamePlaceholder: 'Ví dụ: Nguyễn Văn A',
    phoneLabel: 'Số điện thoại',
    phonePlaceholder: '0901234567 hoặc +84...',
    emailLabel: 'Địa chỉ Email',
    emailPlaceholder: 'name@example.com',
    relationshipLabel: 'Mối quan hệ',
    relationshipPlaceholder: 'Ví dụ: Con gái, Vợ/Chồng, Luật sư...',
    noteLabel: 'Ghi chú bổ sung',
    notePlaceholder: 'Ghi chú ủy quyền hoặc thông tin liên hệ phụ...',
    dobLabel: 'Ngày sinh',
    contactNotice: '* Yêu cầu ít nhất một phương thức liên lạc: Số điện thoại hoặc Email.',

    // Buttons & alerts
    saveTrusteeBtn: 'Lưu Người thi hành bên ngoài',
    addBeneficiaryBtn: 'Thêm Người thụ hưởng',
    submitting: 'Đang xử lý...',
    appointedStatus: 'Đã chỉ định (APPOINTED)',
    addedSuccessTrustee: 'Đã thêm Người thi hành bên ngoài thành công.',
    skippedSuccessTrustee: 'Đã đánh dấu bỏ qua Người thi hành bên ngoài (Cục bộ).',
    addedSuccessBeneficiary: 'Đã thêm Người thụ hưởng thành công.',
  },
  en: {
    brandName: 'LegacyVault',
    eyebrow: 'LEGACY & EXTERNAL EXECUTOR SETUP',
    pageTitle: 'Beneficiaries & Trustee Setup',
    pageDesc:
      'Configure digital legacy trusteeship and beneficiaries with security, clarity, and legal precision.',
    navBack: '← Back',
    navToLogin: 'Sign in',
    navToRegister: 'Register',

    // Readiness Banner
    readinessTitle: 'Vault Configuration Readiness',
    statusReady: 'Configuration Ready',
    statusPending: 'Action Required',
    readyMsg: 'Minimum requirements met: At least 1 Beneficiary is configured.',
    pendingMsg: 'At least 1 Beneficiary is required to complete vault configuration.',
    beneficiaryCountLabel: 'Beneficiaries:',
    trusteeStatusLabel: 'Trustee:',
    trusteeConfigured: 'Appointed',
    trusteeSkipped: 'Skipped (Optional)',
    trusteeUnconfigured: 'Not Configured (Optional)',

    // Section A: Trustee
    trusteeTag: 'OPTIONAL',
    trusteeTitle: '2. External Executor (Trustee)',
    trusteeSubtitle:
      'The designated person who assists in initiating the heritage handover upon designated events.',
    trusteeNotice:
      'Trustee is optional. You may skip this step. The Trustee does NOT need an account, has NO permissions to unlock, decrypt, or view secrets, and is NOT automatically a beneficiary. Max 1 appointed Trustee per Vault.',
    trusteeSkippedBadge: 'Trustee Skipped',
    trusteeSkippedDesc:
      'You chose not to designate a Trustee for this vault. You can configure one at any time if you change your mind.',
    unskipTrusteeBtn: 'Set up Trustee',
    skipTrusteeBtn: 'Skip Trustee',
    maxTrusteeReachedNotice:
      'The vault already has 1 appointed Trustee (Maximum of 1 appointed Trustee per Vault reached).',
    duplicateTrusteeError:
      'A trustee has already been appointed for this vault. Maximum 1 appointed trustee per vault.',
    vaultNotEditableError:
      'The vault is in a state that cannot be edited.',

    // Section B: Beneficiary
    beneficiaryTag: 'AT LEAST ONE REQUIRED',
    beneficiaryTitle: '1. Beneficiaries',
    beneficiarySubtitle:
      'Individuals designated to receive legacy records once the handover process is duly executed.',
    beneficiaryNotice:
      'At least 1 Beneficiary is required for vault readiness. Beneficiaries do NOT need an account. The system does NOT create accounts, does NOT issue Claim Links, Guest Portals, or OTPs, and does NOT allocate inheritance percentages at this step.',
    noBeneficiaries:
      'No beneficiaries added yet. Please add at least 1 beneficiary below.',
    beneficiaryListTitle: 'Current Beneficiaries:',

    // Form fields
    fullNameLabel: 'Full Name',
    fullNamePlaceholder: 'e.g. John Doe',
    phoneLabel: 'Phone Number',
    phonePlaceholder: '0901234567 or +84...',
    emailLabel: 'Email Address',
    emailPlaceholder: 'name@example.com',
    relationshipLabel: 'Relationship',
    relationshipPlaceholder: 'e.g. Daughter, Spouse, Legal Counsel...',
    noteLabel: 'Additional Note',
    notePlaceholder: 'Delegation notes or auxiliary contact info...',
    dobLabel: 'Date of Birth',
    contactNotice: '* At least one contact method (Phone or Email) is required.',

    // Buttons & alerts
    saveTrusteeBtn: 'Save Trustee',
    addBeneficiaryBtn: 'Add Beneficiary',
    submitting: 'Saving...',
    appointedStatus: 'Appointed (APPOINTED)',
    addedSuccessTrustee: 'Trustee added successfully.',
    skippedSuccessTrustee: 'Trustee skipped (Local choice).',
    addedSuccessBeneficiary: 'Beneficiary added successfully.',
  },
};

Object.assign(i18n.vi,{updatedSuccess:'Cập nhật thông tin thành công.',pageDesc:'Khai báo người thi hành bên ngoài tùy chọn và người thụ hưởng cho kho di sản.',trusteeSubtitle:'Người liên hệ hỗ trợ gia đình theo quy trình được xác minh.',trusteeNotice:'Bạn có thể bỏ qua hoặc chỉ định một người thi hành bên ngoài. Người này không cần tài khoản và không được mở khóa hay xem nội dung bí mật. Chỉ định người thi hành bên ngoài không tự thêm họ vào danh sách người thụ hưởng.',beneficiarySubtitle:'Người được ghi nhận trong kế hoạch di sản; việc bàn giao theo quy trình được duyệt.',beneficiaryNotice:'Cần ít nhất một người thụ hưởng để hoàn tất cấu hình kho. Bạn có thể khai báo mà không cần tạo tài khoản cho họ. Phần chia tài sản được xác định theo căn cứ pháp lý được duyệt.',appointedStatus:'Đã chỉ định',skippedSuccessTrustee:'Bạn đã chọn bỏ qua người thi hành bên ngoài.'});
Object.assign(i18n.en,{updatedSuccess:'Information updated successfully.',pageDesc:'Record optional trustees and beneficiaries for your heritage vault.',trusteeSubtitle:'A contact who can help your family through a verified process.',trusteeNotice:'You may skip this step or appoint one trustee. They do not need an account and cannot unlock or view secret content. Appointing a trustee does not add them as a beneficiary.',beneficiarySubtitle:'A person recorded in your heritage plan; transfer follows the approved process.',beneficiaryNotice:'At least one beneficiary is needed to complete vault configuration. You can record them without creating an account. Asset shares follow approved legal documents.',appointedStatus:'Appointed',skippedSuccessTrustee:'You chose to skip the trustee.'});
const emptyTrustee={fullName:'',phone:'',email:'',relationship:''};
const emptyBeneficiary={fullName:'',relationship:'',dateOfBirth:'',phone:'',email:''};
const safeError=(code,lang)=>({TRUSTEE_ALREADY_EXISTS:lang==='en'?'A trustee is already appointed.':'Kho đã có người thi hành bên ngoài.',VAULT_NOT_EDITABLE:lang==='en'?'This vault cannot be edited now.':'Kho hiện không cho phép chỉnh sửa.',VALIDATION_FAILED:lang==='en'?'Please check the form.':'Vui lòng kiểm tra thông tin.',ACCESS_DENIED:lang==='en'?'You do not have access to this vault.':'Bạn không có quyền truy cập kho này.',RESOURCE_NOT_FOUND:lang==='en'?'No accessible vault was found.':'Không tìm thấy kho thuộc quyền truy cập.'}[code] || (lang==='en'?'Unable to load or save records. Please retry.':'Không thể tải hoặc lưu thông tin. Vui lòng thử lại.'));
export default function TrusteeBeneficiaryPage({vaultId,accessToken,lang='vi',onUnauthorized,onRefreshTrigger=0,isDevPreview=false}) {
 const t=i18n[lang]||i18n.vi;
 const [trustees,setTrustees]=useState([]),[beneficiaries,setBeneficiaries]=useState([]);
 const [isSkipped,setIsSkipped]=useState(false),[readiness,setReadiness]=useState(null);
  const [activeTab, setActiveTab] = useState('beneficiaries');
 const [editTarget,setEditTarget]=useState(null);
 const [alert,setAlert]=useState(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(null);
 const [retry,setRetry]=useState(0),[pageIndex,setPageIndex]=useState(0),[pages,setPages]=useState(0);
 const [trusteeForm,setTrusteeForm]=useState(emptyTrustee),[beneficiaryForm,setBeneficiaryForm]=useState(emptyBeneficiary);
 const [trusteeErrors,setTrusteeErrors]=useState({}),[beneficiaryErrors,setBeneficiaryErrors]=useState({});
 const [isSubmittingTrustee,setIsSubmittingTrustee]=useState(false),[isSubmittingBeneficiary,setIsSubmittingBeneficiary]=useState(false);
 const pending=useRef(false),alive=useRef(true),mutation=useRef(null),loadRequest=useRef(null);
 const trusteeDialog=useRef(null),beneficiaryDialog=useRef(null);
  const benTabRef = useRef(null), trusteeTabRef = useRef(null);
 const locale=useRef(lang);useEffect(()=>{locale.current=lang},[lang]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;mutation.current?.abort()}},[]);
 const lastActiveElementRef = useRef(null);
 const isAuthenticated = Boolean(accessToken && typeof accessToken === 'string' && accessToken.trim().length > 0);
 const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
 const hasPreview = searchParams.get('preview') === 'true' || searchParams.get('fixture') === 'true' || searchParams.has('scenario');
 const isDevPreviewActive = Boolean(import.meta.env?.DEV && !isAuthenticated && (isDevPreview || hasPreview));
 const prevAuthRef = useRef(isAuthenticated);
 const fetchRequestId = useRef(0);

 const openBeneficiaryDialog = () => {
   lastActiveElementRef.current = typeof document !== 'undefined' ? document.activeElement : null;
   beneficiaryDialog.current?.showModal();
   // native showModal auto-focuses first focusable element
 };
 const openTrusteeDialog = () => {
   lastActiveElementRef.current = typeof document !== 'undefined' ? document.activeElement : null;
   trusteeDialog.current?.showModal();
   // native showModal auto-focuses first focusable element
 };
 const closeDialog = (ref) => {
   ref.current?.close();
   lastActiveElementRef.current?.focus();
 };

 useEffect(()=>{
  let ignore = false;
  const controller = new AbortController();
  loadRequest.current = controller;
  const currentRequestId = ++fetchRequestId.current;

  const isTransitionToAuth = !prevAuthRef.current && isAuthenticated;
  prevAuthRef.current = isAuthenticated;

  if (isTransitionToAuth) {
    setEditTarget(null);
    trusteeDialog.current?.close();
    beneficiaryDialog.current?.close();
    setAlert(null);
    setTrusteeErrors({});
    setBeneficiaryErrors({});
    setTrusteeForm(emptyTrustee);
    setBeneficiaryForm(emptyBeneficiary);
    setTrustees([]);
    setBeneficiaries([]);
    setReadiness(null);
    setIsSkipped(false);
  }

  Promise.resolve().then(async()=>{
   if(ignore || controller.signal.aborted || currentRequestId !== fetchRequestId.current) return;
   setLoading(true);
   setLoadError(null);
   try {
    if (isDevPreviewActive) {
      const scenario = new URLSearchParams(window.location.search).get('scenario');
      if (scenario === 'empty') {
        if (ignore || controller.signal.aborted || currentRequestId !== fetchRequestId.current) return;
        setTrustees([]);
        setBeneficiaries([]);
        setReadiness({ isReady: false, beneficiaryCount: 0, issues: [{ code: 'BENEFICIARY_REQUIRED' }] });
        setPages(0);
      } else {
        if (ignore || controller.signal.aborted || currentRequestId !== fetchRequestId.current) return;
        setTrustees([{
          id: '11111111-1111-4111-8111-111111111111',
          vaultId,
          fullName: lang === 'en' ? 'Binh Tran' : 'Trần Thị Bình',
          relationship: lang === 'en' ? 'Legal Representative' : 'Luật sư đại diện',
          phone: '0912345678',
          email: 'binh.tran@example.com',
          status: 'APPOINTED',
          appointedAt: '2026-10-10T00:00:00Z',
          revokedAt: null,
        }]);
        setBeneficiaries([{
          id: '22222222-2222-4222-8222-222222222222',
          vaultId,
          fullName: lang === 'en' ? 'An Nguyen' : 'Nguyễn Văn An',
          relationship: lang === 'en' ? 'Son' : 'Con trai',
          dateOfBirth: '1995-05-20',
          phone: '0901234567',
          email: 'an.nguyen@example.com',
          status: 'DESIGNATED',
          hasAccount: false,
          hasIdentityNumber: false,
          createdAt: '2026-10-10T00:00:00Z',
        }]);
        setReadiness({ isReady: true, beneficiaryCount: 1, issues: [] });
        setPages(1);
      }
    } else {
      const options={accessToken,lang:locale.current,signal:controller.signal};
      const [trusteesData,listData,readyData]=await Promise.all([getTrustees(vaultId,options),getBeneficiaries(vaultId,{...options,page:pageIndex}),checkConfigurationReadiness(vaultId,options)]);
      if(ignore || controller.signal.aborted || currentRequestId !== fetchRequestId.current) return;
      setTrustees(trusteesData);
      setBeneficiaries(listData.content);
      setReadiness(readyData);
      setPages(listData.totalPages);
    }
   }catch(error){
     if(ignore || controller.signal.aborted || currentRequestId !== fetchRequestId.current) return;
     if(error.status===401){setLoadError('UNAUTHENTICATED');onUnauthorized?.();}
     else setLoadError(error.code||'LOAD_ERROR');
   }
   finally {
     if(!ignore && alive.current && currentRequestId === fetchRequestId.current) setLoading(false);
   }
  });
  return () => {
    ignore = true;
    controller.abort();
  };
 },[vaultId,accessToken,pageIndex,retry,onRefreshTrigger,onUnauthorized,isDevPreviewActive,isAuthenticated,lang]);

  const handleTabSwitch = (tab) => {
    if (activeTab === tab) return;
    trusteeDialog.current?.close();
    beneficiaryDialog.current?.close();
    setAlert(null);
    setBeneficiaryErrors({});
    setTrusteeErrors({});
    setActiveTab(tab);
  };
  const handleTabKeyDown = (event, currentTab) => {
    let target = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      target = currentTab === 'beneficiaries' ? 'trustee' : 'beneficiaries';
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      target = currentTab === 'trustee' ? 'beneficiaries' : 'trustee';
    } else if (event.key === 'Home') {
      event.preventDefault();
      target = 'beneficiaries';
    } else if (event.key === 'End') {
      event.preventDefault();
      target = 'trustee';
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      target = currentTab;
    }
    if (target) {
      handleTabSwitch(target);
      if (target === 'beneficiaries') benTabRef.current?.focus();
      else if (target === 'trustee') trusteeTabRef.current?.focus();
    }
  };
  const handleSkipTrustee=()=>{if(pending.current)return;setIsSkipped(true);setTrusteeForm(emptyTrustee);setTrusteeErrors({});setAlert({type:'success',key:'skippedSuccessTrustee'})};
 const handleUnskipTrustee=()=>setIsSkipped(false);
 async function save(event,kind){
  event.preventDefault();if(pending.current)return;
  const isTrustee=kind==='trustee',data=isTrustee?trusteeForm:beneficiaryForm;
  const errors=isTrustee?validateTrustee(data,lang):validateBeneficiary(data,lang);
  (isTrustee?setTrusteeErrors:setBeneficiaryErrors)(errors);if(Object.keys(errors).length)return;
  pending.current=true;const controller=new AbortController();mutation.current=controller;
  (isTrustee?setIsSubmittingTrustee:setIsSubmittingBeneficiary)(true);
  try{
   if (isDevPreviewActive) {
     if (isTrustee) {
       setTrustees([{
         id: '11111111-1111-4111-8111-' + Date.now().toString().slice(-12).padStart(12, '0'),
         vaultId,
         fullName: data.fullName.trim(),
         phone: data.phone?.trim() || null,
         email: data.email?.trim() || null,
         relationship: data.relationship?.trim() || null,
         status: 'APPOINTED',
         appointedAt: new Date().toISOString(),
         revokedAt: null,
       }]);
     } else {
       const newBen = {
         id: '22222222-2222-4222-8222-' + Date.now().toString().slice(-12).padStart(12, '0'),
         vaultId,
         fullName: data.fullName.trim(),
         relationship: data.relationship?.trim() || null,
         dateOfBirth: data.dateOfBirth || null,
         phone: data.phone?.trim() || null,
         email: data.email?.trim() || null,
         status: 'DESIGNATED',
         hasAccount: false,
         hasIdentityNumber: false,
         createdAt: new Date().toISOString(),
       };
       setBeneficiaries(prev => [...prev, newBen]);
       setReadiness(prev => ({ isReady: true, beneficiaryCount: (prev?.beneficiaryCount || 0) + 1, issues: [] }));
     }
   } else {
     await (isTrustee?createTrustee:createBeneficiary)(vaultId,data,{accessToken,lang,signal:controller.signal});
   }
   if(!alive.current||controller.signal.aborted)return;
   closeDialog(isTrustee?trusteeDialog:beneficiaryDialog);
   (isTrustee?setTrusteeForm:setBeneficiaryForm)(isTrustee?emptyTrustee:emptyBeneficiary);
   (isTrustee?setTrusteeErrors:setBeneficiaryErrors)({});setAlert({type:'success',key:isTrustee?'addedSuccessTrustee':'addedSuccessBeneficiary'});if(isTrustee)setIsSkipped(false);
   if (!isDevPreviewActive) { setPageIndex(0); setRetry(value=>value+1); }
  }catch(error){
   if(!alive.current||controller.signal.aborted)return;
   if(error.status===401){onUnauthorized?.();return;}
   if([403,404].includes(error.status)){loadRequest.current?.abort();setTrustees([]);setBeneficiaries([]);setReadiness(null);setTrusteeForm(emptyTrustee);setBeneficiaryForm(emptyBeneficiary);setLoadError(error.code);}
   setAlert({type:'error',code:error.code||'SAVE_ERROR'});
  }finally{pending.current=false;if(alive.current)(isTrustee?setIsSubmittingTrustee:setIsSubmittingBeneficiary)(false);}
 }
 const handleTrusteeSubmit=event=>save(event,'trustee'),handleBeneficiarySubmit=event=>save(event,'beneficiary');
 const localizedTrusteeErrors=validateTrustee(trusteeForm,lang),localizedBeneficiaryErrors=validateBeneficiary(beneficiaryForm,lang);
 if(loading || (!loadError && !readiness))return <div className="lv-tb-page"><div className="lv-tb-skeleton" role="status" aria-live="polite" aria-busy="true"><span>{lang==='en'?'Loading records…':'Đang tải thông tin…'}</span><div aria-hidden="true"/><div aria-hidden="true"/></div></div>;
 if(loadError)return <section className="lv-tb-load-error" role="alert"><p>{safeError(loadError,lang)}</p><button onClick={()=>setRetry(value=>value+1)}>{lang==='en'?'Retry':'Thử lại'}</button></section>;
  const appointedTrustee = trustees[0];
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="lv-tb-page">
      <div className="lv-tb-container">
        {/* Hero Title */}
        <div className="lv-tb-title-block">
          <h1 className="lv-tb-title">{lang === 'en' ? 'Beneficiaries & trustees' : 'Người thụ hưởng & Người thi hành bên ngoài'}</h1>
          <p className="lv-tb-desc">{t.pageDesc}</p>
        </div>

        {/* Sample Data Preview Banner (Bug 17) */}
        {isDevPreviewActive && (
          <div className="lv-tb-preview-banner" role="status" aria-live="polite">
            <span className="lv-tb-preview-badge">
              <span className="lv-tb-preview-icon" aria-hidden="true">🧪</span>
              <span className="lv-tb-preview-tag">{lang === 'en' ? 'Sample data' : 'Dữ liệu minh họa'}</span>
            </span>
            <p className="lv-tb-preview-desc">
              {lang === 'en'
                ? 'Changes in this preview are for demonstration only and are not saved to the system.'
                : 'Các thay đổi trong chế độ này chỉ dùng để xem thử, không được lưu vào hệ thống.'}
            </p>
          </div>
        )}

        {/* Global Alert Notification */}
        {alert && (
          <div className={`lv-tb-alert ${alert.type}`} role="alert">
            <span>{alert.key ? t[alert.key] : safeError(alert.code,lang)}</span>
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              onClick={() => setAlert(null)}
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        )}

        {/* Configuration Readiness Banner */}
        <section className="lv-tb-readiness-banner" aria-label="Configuration Readiness Status">
          <div className="lv-tb-readiness-header">
            <span className="lv-tb-readiness-title">
              <span aria-hidden="true">✦</span> {t.readinessTitle}
            </span>
            <span className={`lv-tb-status-badge ${readiness.isReady ? 'ready' : 'pending'}`}>
              {readiness.isReady ? t.statusReady : t.statusPending}
            </span>
          </div>

          <div className="lv-tb-readiness-grid">
            <div className="lv-tb-readiness-item">
              <span className="lv-tb-readiness-label">{t.beneficiaryCountLabel}</span>
              <span className={`lv-tb-readiness-val ${readiness.beneficiaryCount >= 1 ? 'done' : 'warn'}`}>
                {beneficiaries.length >= 1
                  ? `${readiness.beneficiaryCount} ${lang==='en'?(readiness.beneficiaryCount===1?'person':'people'):'người'}`
                  : (lang==='en'?'0 people (at least 1 required)':'0 người (Cần tối thiểu 1)')}
              </span>
            </div>
            <div className="lv-tb-readiness-item">
              <span className="lv-tb-readiness-label">{t.trusteeStatusLabel}</span>
              <span className={`lv-tb-readiness-val ${appointedTrustee || isSkipped ? 'done' : 'warn'}`}>
                {appointedTrustee
                  ? t.trusteeConfigured
                  : isSkipped
                  ? t.trusteeSkipped
                  : t.trusteeUnconfigured}
              </span>
            </div>
          </div>
        </section>


        {/* Navigation Tabs to choose distinct list (Bug 17) */}
        <div className="lv-tb-tabs" role="tablist" aria-label={lang === 'en' ? 'People categories' : 'Phân loại người liên quan'}>
          <button
            type="button"
            role="tab"
            id="tab-beneficiaries"
            ref={benTabRef}
            tabIndex={activeTab === 'beneficiaries' ? 0 : -1}
            onKeyDown={(e) => handleTabKeyDown(e, 'beneficiaries')}
            aria-selected={activeTab === 'beneficiaries'}
            aria-controls="panel-beneficiaries"
            className={`lv-tb-tab-btn ${activeTab === 'beneficiaries' ? 'is-active' : ''}`}
            onClick={() => handleTabSwitch('beneficiaries')}
          >
            <span className="lv-tb-tab-title">{lang === 'en' ? '1. Beneficiaries' : '1. Người thụ hưởng'}</span>
            <span className="lv-tb-tab-count">({beneficiaries.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-trustee"
            ref={trusteeTabRef}
            tabIndex={activeTab === 'trustee' ? 0 : -1}
            onKeyDown={(e) => handleTabKeyDown(e, 'trustee')}
            aria-selected={activeTab === 'trustee'}
            aria-controls="panel-trustee"
            className={`lv-tb-tab-btn ${activeTab === 'trustee' ? 'is-active' : ''}`}
            onClick={() => handleTabSwitch('trustee')}
          >
            <span className="lv-tb-tab-title">{lang === 'en' ? '2. External Executor (Trustee)' : '2. Người thi hành bên ngoài'}</span>
            <span className="lv-tb-tab-status">
              {appointedTrustee
                ? (lang === 'en' ? 'Appointed' : 'Đã chỉ định')
                : isSkipped
                ? (lang === 'en' ? 'Skipped' : 'Đã bỏ qua')
                : (lang === 'en' ? 'Optional' : 'Tùy chọn')}
            </span>
          </button>
        </div>

        {/* Main Stack */}
        <div className="lv-tb-sections-stack">
          {/* SECTION B: BENEFICIARY (ST-05) */}
          <div id="panel-beneficiaries" role="tabpanel" aria-labelledby="tab-beneficiaries" hidden={activeTab !== 'beneficiaries'} tabIndex={0}>
          <section className="lv-tb-section-card" aria-labelledby="beneficiary-heading">
            <div className="lv-tb-section-header">
              <button type="button" className="lv-tb-btn-primary" onClick={openBeneficiaryDialog}>+ {t.addBeneficiaryBtn}</button>
              <div className="lv-tb-section-title-wrap">
                <span className="lv-tb-section-tag">{t.beneficiaryTag}</span>
                <h2 id="beneficiary-heading" className="lv-tb-section-title">
                  {t.beneficiaryTitle}
                </h2>
                <p className="lv-tb-section-subtitle">{t.beneficiarySubtitle}</p>
              </div>
            </div>

            <div className="lv-tb-notice-box">
              <strong>{lang === 'vi' ? 'Lưu ý: ' : 'Please note: '}</strong>
              {t.beneficiaryNotice}
            </div>

            {/* Existing Beneficiaries List */}
            {beneficiaries.length === 0 ? (
              <div className="lv-tb-empty-state">{t.noBeneficiaries}</div>
            ) : (
              <div style={{ marginBottom: '28px' }}>
                <h3
                  style={{
                    fontSize: '14.5px',
                    fontWeight: 700,
                    color: 'var(--lv-brand-forest, #164639)',
                    marginBottom: '12px',
                  }}
                >
                  {t.beneficiaryListTitle} ({beneficiaries.length})
                </h3>
                {beneficiaries.map((b) => (
                  <div key={b.id} className="lv-tb-entity-card">
                    <div className="lv-tb-entity-header">
                      <span className="lv-tb-entity-name">{b.fullName}</span>
                      {!isDevPreviewActive && <button type="button" className="lv-tb-btn-secondary" onClick={()=>setEditTarget({kind:'beneficiary',person:b})}>{lang==='en'?'Edit':'Chỉnh sửa'}</button>}
                      <span className="lv-tb-badge-appointed">
                        {b.relationship || (lang === 'vi' ? 'Người thụ hưởng' : 'Beneficiary')}
                      </span>
                    </div>
                    <div className="lv-tb-entity-grid">
                      <div className="lv-tb-entity-prop">
                        <span className="lv-tb-prop-label">{t.dobLabel}</span>
                        <span className="lv-tb-prop-value">{b.dateOfBirth || '—'}</span>
                      </div>
                      <div className="lv-tb-entity-prop">
                        <span className="lv-tb-prop-label">{t.phoneLabel}</span>
                        <span className="lv-tb-prop-value">{b.phone || '—'}</span>
                      </div>
                      <div className="lv-tb-entity-prop">
                        <span className="lv-tb-prop-label">{t.emailLabel}</span>
                        <span className="lv-tb-prop-value">{b.email || '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pages>1 && <nav aria-label={lang==='en'?'Beneficiary pages':'Trang người thụ hưởng'}><button disabled={pageIndex===0 || isSubmittingTrustee || isSubmittingBeneficiary} onClick={()=>setPageIndex(value=>value-1)}>{lang==='en'?'Previous':'Trước'}</button><span>{pageIndex+1}/{pages}</span><button disabled={pageIndex+1>=pages || isSubmittingTrustee || isSubmittingBeneficiary} onClick={()=>setPageIndex(value=>value+1)}>{lang==='en'?'Next':'Sau'}</button></nav>}
            {/* Add Beneficiary Form */}
            <dialog ref={beneficiaryDialog} className="lv-tb-dialog" aria-labelledby="beneficiary-form-title" onClose={()=>lastActiveElementRef.current?.focus()} onCancel={event=>{if(pending.current)event.preventDefault()}}>
            <div className="lv-tb-dialog-header"><h3 id="beneficiary-form-title">{t.addBeneficiaryBtn}</h3><button type="button" className="lv-tb-btn-secondary" disabled={isSubmittingBeneficiary} onClick={()=>closeDialog(beneficiaryDialog)}>{lang==='en'?'Close':'Đóng'}</button></div>
            {isDevPreviewActive && (
              <div className="lv-tb-dialog-preview-notice" role="note">
                <span className="lv-tb-preview-badge">
                  <span className="lv-tb-preview-icon" aria-hidden="true">🧪</span>
                  <span className="lv-tb-preview-tag">{lang === 'en' ? 'Sample data' : 'Dữ liệu minh họa'}</span>
                </span>
                <span className="lv-tb-dialog-preview-text">
                  {lang === 'en'
                    ? 'Changes in this preview are for demonstration only and are not saved to the system.'
                    : 'Các thay đổi trong chế độ này chỉ dùng để xem thử, không được lưu vào hệ thống.'}
                </span>
              </div>
            )}
            <form className="lv-tb-form" onSubmit={handleBeneficiarySubmit} noValidate>
              {alert?.type==='error' && <p role="alert">{safeError(alert.code,lang)}</p>}
              <div className="lv-tb-form-grid">
                {/* Full Name */}
                <div className="lv-tb-field-group full-width">
                  <label className="lv-tb-label" htmlFor="ben-fullname">
                    {t.fullNameLabel} <span className="lv-tb-req">*</span>
                  </label>
                  <input
                    id="ben-fullname"
                    type="text" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                    maxLength={150}
                    className={`lv-tb-input ${beneficiaryErrors.fullName ? 'has-error' : ''}`}
                    placeholder={t.fullNamePlaceholder}
                    value={beneficiaryForm.fullName}
                    onChange={(e) =>
                      setBeneficiaryForm(prev => ({ ...prev, fullName: e.target.value }))
                    }
                  />
                  {beneficiaryErrors.fullName && (
                    <span className="lv-tb-error-text">{localizedBeneficiaryErrors.fullName}</span>
                  )}
                </div>

                {/* Relationship */}
                <div className="lv-tb-field-group">
                  <label className="lv-tb-label" htmlFor="ben-relationship">
                    {t.relationshipLabel}
                  </label>
                  <input
                    id="ben-relationship"
                    type="text" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                    maxLength={100}
                    className={`lv-tb-input ${beneficiaryErrors.relationship ? 'has-error' : ''}`}
                    placeholder={t.relationshipPlaceholder}
                    value={beneficiaryForm.relationship}
                    onChange={(e) =>
                      setBeneficiaryForm(prev => ({ ...prev, relationship: e.target.value }))
                    }
                  />
                  {beneficiaryErrors.relationship && (
                    <span className="lv-tb-error-text">{localizedBeneficiaryErrors.relationship}</span>
                  )}
                </div>

                {/* Date of Birth */}
                <div className="lv-tb-field-group">
                  <label className="lv-tb-label" htmlFor="ben-dob">
                    {t.dobLabel}
                  </label>
                  <input
                    id="ben-dob"
                    type="date" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                    max={todayStr}
                    className={`lv-tb-input ${beneficiaryErrors.dateOfBirth ? 'has-error' : ''}`}
                    value={beneficiaryForm.dateOfBirth}
                    onChange={(e) =>
                      setBeneficiaryForm(prev => ({ ...prev, dateOfBirth: e.target.value }))
                    }
                  />
                  {beneficiaryErrors.dateOfBirth && (
                    <span className="lv-tb-error-text">{localizedBeneficiaryErrors.dateOfBirth}</span>
                  )}
                </div>

                {/* Phone */}
                <div className="lv-tb-field-group">
                  <label className="lv-tb-label" htmlFor="ben-phone">
                    {t.phoneLabel}
                  </label>
                  <input
                    id="ben-phone"
                    maxLength={20} onBlur={()=>setBeneficiaryErrors(prev=>({...prev,phone:validateBeneficiary(beneficiaryForm,lang).phone}))}
                    type="tel" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                    className={`lv-tb-input ${beneficiaryErrors.phone ? 'has-error' : ''}`}
                    placeholder={t.phonePlaceholder}
                    value={beneficiaryForm.phone}
                    onChange={(e) =>
                      setBeneficiaryForm(prev => ({ ...prev, phone: e.target.value }))
                    }
                  />
                  {beneficiaryErrors.phone && (
                    <span className="lv-tb-error-text">{localizedBeneficiaryErrors.phone}</span>
                  )}
                </div>

                {/* Email */}
                <div className="lv-tb-field-group">
                  <label className="lv-tb-label" htmlFor="ben-email">
                    {t.emailLabel}
                  </label>
                  <input
                    id="ben-email"
                    maxLength={254} onBlur={()=>setBeneficiaryErrors(prev=>({...prev,email:validateBeneficiary(beneficiaryForm,lang).email}))}
                    type="email" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                    className={`lv-tb-input ${beneficiaryErrors.email ? 'has-error' : ''}`}
                    placeholder={t.emailPlaceholder}
                    value={beneficiaryForm.email}
                    onChange={(e) =>
                      setBeneficiaryForm(prev => ({ ...prev, email: e.target.value }))
                    }
                  />
                  {beneficiaryErrors.email && (
                    <span className="lv-tb-error-text">{localizedBeneficiaryErrors.email}</span>
                  )}
                </div>
              </div>

              <div className="lv-tb-actions-row">
                <button
                  type="submit"
                  className="lv-tb-btn-primary"
                  disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                >
                  {isSubmittingBeneficiary ? t.submitting : t.addBeneficiaryBtn}
                </button>
              </div>
            </form>
            </dialog>
          </section>
          </div>

          {/* SECTION A: TRUSTEE (ST-04) */}
          <div id="panel-trustee" role="tabpanel" aria-labelledby="tab-trustee" hidden={activeTab !== 'trustee'} tabIndex={0}>
          <section className="lv-tb-section-card" aria-labelledby="trustee-heading">
            <div className="lv-tb-section-header">
              <div className="lv-tb-section-title-wrap">
                <span className="lv-tb-section-tag">{t.trusteeTag}</span>
                <h2 id="trustee-heading" className="lv-tb-section-title">
                  {t.trusteeTitle}
                </h2>
                <p className="lv-tb-section-subtitle">{t.trusteeSubtitle}</p>
              </div>

              {!appointedTrustee && !isSkipped && (
                <button
                  type="button"
                  className="lv-tb-btn-skip"
                  onClick={handleSkipTrustee}
                >
                  {t.skipTrusteeBtn}
                </button>
              )}
            </div>

            <div className="lv-tb-notice-box">
              <strong>{lang === 'vi' ? 'Lưu ý: ' : 'Please note: '}</strong>
              {t.trusteeNotice}
            </div>

            {/* Current Trustee or Skipped State */}
            {appointedTrustee ? (
              <div>
                <div className="lv-tb-entity-card">
                  <div className="lv-tb-entity-header">
                    <span className="lv-tb-entity-name">{appointedTrustee.fullName}</span>
                    {!isDevPreviewActive && <button type="button" className="lv-tb-btn-secondary" onClick={()=>setEditTarget({kind:'trustee',person:appointedTrustee})}>{lang==='en'?'Edit':'Chỉnh sửa'}</button>}
                    <span className="lv-tb-badge-appointed">{t.appointedStatus}</span>
                  </div>
                  <div className="lv-tb-entity-grid">
                    <div className="lv-tb-entity-prop">
                      <span className="lv-tb-prop-label">{t.phoneLabel}</span>
                      <span className="lv-tb-prop-value">{appointedTrustee.phone || '—'}</span>
                    </div>
                    <div className="lv-tb-entity-prop">
                      <span className="lv-tb-prop-label">{t.emailLabel}</span>
                      <span className="lv-tb-prop-value">{appointedTrustee.email || '—'}</span>
                    </div>
                    <div className="lv-tb-entity-prop">
                      <span className="lv-tb-prop-label">{t.relationshipLabel}</span>
                      <span className="lv-tb-prop-value">{appointedTrustee.relationship || '—'}</span>
                    </div>

                  </div>
                </div>
                <p className="lv-tb-hint">{t.maxTrusteeReachedNotice}</p>
              </div>
            ) : isSkipped ? (
              <div className="lv-tb-skipped-state">
                <div className="lv-tb-skipped-badge">
                  <span>✓</span> {t.trusteeSkippedBadge}
                </div>
                <p className="lv-tb-skipped-desc">{t.trusteeSkippedDesc}</p>
                <button
                  type="button"
                  className="lv-tb-btn-secondary"
                  onClick={handleUnskipTrustee}
                >
                  {t.unskipTrusteeBtn}
                </button>
              </div>
            ) : (
              <>
              <button type="button" className="lv-tb-btn-primary" onClick={openTrusteeDialog}>{t.unskipTrusteeBtn}</button>
              <dialog ref={trusteeDialog} className="lv-tb-dialog" aria-labelledby="trustee-form-title" onClose={()=>lastActiveElementRef.current?.focus()} onCancel={event=>{if(pending.current)event.preventDefault()}}>
              <div className="lv-tb-dialog-header"><h3 id="trustee-form-title">{t.unskipTrusteeBtn}</h3><button type="button" className="lv-tb-btn-secondary" disabled={isSubmittingTrustee} onClick={()=>closeDialog(trusteeDialog)}>{lang==='en'?'Close':'Đóng'}</button></div>
              {isDevPreviewActive && (
                <div className="lv-tb-dialog-preview-notice" role="note">
                  <span className="lv-tb-preview-badge">
                    <span className="lv-tb-preview-icon" aria-hidden="true">🧪</span>
                    <span className="lv-tb-preview-tag">{lang === 'en' ? 'Sample data' : 'Dữ liệu minh họa'}</span>
                  </span>
                  <span className="lv-tb-dialog-preview-text">
                    {lang === 'en'
                      ? 'Changes in this preview are for demonstration only and are not saved to the system.'
                      : 'Các thay đổi trong chế độ này chỉ dùng để xem thử, không được lưu vào hệ thống.'}
                  </span>
                </div>
              )}
              <form className="lv-tb-form" onSubmit={handleTrusteeSubmit} noValidate>
                {alert?.type==='error' && <p role="alert">{safeError(alert.code,lang)}</p>}
                <div className="lv-tb-form-grid">
                  {/* Full Name */}
                  <div className="lv-tb-field-group full-width">
                    <label className="lv-tb-label" htmlFor="trustee-fullname">
                      {t.fullNameLabel} <span className="lv-tb-req">*</span>
                    </label>
                    <input
                      id="trustee-fullname"
                      type="text" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                      maxLength={150}
                      className={`lv-tb-input ${trusteeErrors.fullName ? 'has-error' : ''}`}
                      placeholder={t.fullNamePlaceholder}
                      value={trusteeForm.fullName}
                      onChange={(e) =>
                        setTrusteeForm(prev => ({ ...prev, fullName: e.target.value }))
                      }
                    />
                    {trusteeErrors.fullName && (
                      <span className="lv-tb-error-text">{localizedTrusteeErrors.fullName}</span>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="lv-tb-field-group">
                    <label className="lv-tb-label" htmlFor="trustee-phone">
                      {t.phoneLabel}
                    </label>
                    <input
                      id="trustee-phone"
                      maxLength={20} onBlur={()=>setTrusteeErrors(prev=>({...prev,phone:validateTrustee(trusteeForm,lang).phone}))}
                      type="tel" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                      className={`lv-tb-input ${trusteeErrors.phone ? 'has-error' : ''}`}
                      placeholder={t.phonePlaceholder}
                      value={trusteeForm.phone}
                      onChange={(e) =>
                        setTrusteeForm(prev => ({ ...prev, phone: e.target.value }))
                      }
                    />
                    {trusteeErrors.phone && (
                      <span className="lv-tb-error-text">{localizedTrusteeErrors.phone}</span>
                    )}
                  </div>

                  {/* Email */}
                  <div className="lv-tb-field-group">
                    <label className="lv-tb-label" htmlFor="trustee-email">
                      {t.emailLabel}
                    </label>
                    <input
                      id="trustee-email"
                      maxLength={254} onBlur={()=>setTrusteeErrors(prev=>({...prev,email:validateTrustee(trusteeForm,lang).email}))}
                      type="email" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                      className={`lv-tb-input ${trusteeErrors.email ? 'has-error' : ''}`}
                      placeholder={t.emailPlaceholder}
                      value={trusteeForm.email}
                      onChange={(e) =>
                        setTrusteeForm(prev => ({ ...prev, email: e.target.value }))
                      }
                    />
                    {trusteeErrors.email && (
                      <span className="lv-tb-error-text">{localizedTrusteeErrors.email}</span>
                    )}
                  </div>

                  {/* Contact requirement notice */}
                  <div className="lv-tb-field-group full-width">
                    <span className="lv-tb-hint">{t.contactNotice}</span>
                  </div>

                  {/* Relationship */}
                  <div className="lv-tb-field-group full-width">
                    <label className="lv-tb-label" htmlFor="trustee-relationship">
                      {t.relationshipLabel}
                    </label>
                    <input
                      id="trustee-relationship"
                      type="text" disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                      maxLength={100}
                      className={`lv-tb-input ${trusteeErrors.relationship ? 'has-error' : ''}`}
                      placeholder={t.relationshipPlaceholder}
                      value={trusteeForm.relationship}
                      onChange={(e) =>
                        setTrusteeForm(prev => ({ ...prev, relationship: e.target.value }))
                      }
                    />
                    {trusteeErrors.relationship && (
                      <span className="lv-tb-error-text">{localizedTrusteeErrors.relationship}</span>
                    )}
                  </div>

                </div>

                <div className="lv-tb-actions-row">
                  <button
                    type="submit"
                    className="lv-tb-btn-primary"
                    disabled={isSubmittingTrustee || isSubmittingBeneficiary}
                  >
                    {isSubmittingTrustee ? t.submitting : t.saveTrusteeBtn}
                  </button>
                </div>
              </form>
              </dialog>
              </>
            )}
          </section>
          </div>
        </div>
        {editTarget&&<RelatedPersonEditDialog key={`${editTarget.kind}:${editTarget.person.id}:${vaultId}:${accessToken}`}
          {...editTarget} vaultId={vaultId} accessToken={accessToken} lang={lang} labels={t}
          onUnauthorized={onUnauthorized} onClose={()=>setEditTarget(null)}
          onUpdated={person=>{if(editTarget.kind==='trustee')setTrustees(prev=>prev.map(item=>item.id===person.id?person:item));else setBeneficiaries(prev=>prev.map(item=>item.id===person.id?person:item));setEditTarget(null);setAlert({type:'success',key:'updatedSuccess'});}} />}
      </div>
    </div>
  );
}
