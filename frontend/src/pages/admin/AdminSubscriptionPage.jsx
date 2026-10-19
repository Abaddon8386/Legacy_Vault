import { useState, useEffect, useCallback } from 'react';
import './AdminSubscriptionPage.css';
import {
  fetchAdminPlans,
  fetchAdminPlanDetail,
  createAdminPlanDraft,
  updateAdminPlanDraft,
  publishAdminPlanVersion,
  deprecateAdminPlanVersion,
  lookupAdminAccount,
  formatBytes,
  formatVnd,
  adminSubscriptionErrorMessage,
} from '../../utils/adminSubscriptionService.js';

export default function AdminSubscriptionPage({
  lang = 'vi',
  accessToken,
  onUnauthorized,
  onNavigateHome,
}) {
  const en = lang === 'en';

  const [activeTab, setActiveTab] = useState('catalog');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [plansError, setPlansError] = useState(null);

  const [selectedPlanCode, setSelectedPlanCode] = useState(null);
  const [planDetail, setPlanDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Edit / Version modal drawer
  const [editingVersion, setEditingVersion] = useState(null);
  const [editFormData, setEditFormData] = useState({
    nameVi: '',
    nameEn: '',
    descriptionVi: '',
    descriptionEn: '',
    purchasePriceVnd: 0,
    assetLimit: 5,
    storageBytesLimit: 104857600,
    fileBytesLimit: 10485760,
    changeNotes: '',
    concurrencyToken: 0,
  });
  const [savingVersion, setSavingVersion] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Account lookup state
  const [accountQuery, setAccountQuery] = useState('');
  const [accountData, setAccountData] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);

  const t = {
    title: en ? 'Subscription Plan Catalog' : 'Quản lý gói sử dụng & Danh mục',
    subtitle: en
      ? 'Manage subscription plans, pricing, quotas, draft versions, and inspect live account quotas.'
      : 'Quản lý các gói Cơ bản, Tiêu chuẩn, Mở rộng; phát hành phiên bản cấu hình và tra cứu hạn mức tài khoản thật.',
    tabCatalog: en ? 'Plans & Versions' : 'Danh mục gói & Phiên bản',
    tabAccounts: en ? 'Account Quota Lookup' : 'Tra cứu tài khoản & Mức dùng',
    tabTransactions: en ? 'Payment Transactions' : 'Giao dịch thanh toán',
    activeTag: en ? 'Active' : 'Đang áp dụng',
    draftTag: en ? 'Draft' : 'Bản nháp',
    deprecatedTag: en ? 'Deprecated' : 'Đã ngừng',
    pricePerMonth: en ? '/ lifetime' : '/ trọn đời',
    freePrice: en ? 'Free' : 'Miễn phí',
    assetsLimit: en ? 'Assets' : 'Tài sản',
    storageLimit: en ? 'Storage' : 'Dung lượng',
    fileLimit: en ? 'Max File' : 'Tệp tối đa',
    standardFilePolicy: en ? '10 MB (Fixed policy limit)' : '10 MB (Cố định theo chính sách)',
    createDraft: en ? '+ Create New Draft' : '+ Tạo bản nháp mới',
    editDraft: en ? 'Edit Draft' : 'Chỉnh sửa bản nháp',
    publish: en ? 'Publish Version' : 'Công bố phiên bản',
    deprecate: en ? 'Deprecate' : 'Ngừng áp dụng',
    publishedNotice: en ? 'Published versions cannot be modified directly.' : 'Phiên bản đã công bố không thể chỉnh sửa trực tiếp.',
    reloadCatalog: en ? 'Reload Data' : 'Tải lại dữ liệu',
    billingCycleLabel: en ? 'Billing Cycle' : 'Chu kỳ thanh toán',
    billingMonthlyOnly: en ? 'One-time purchase / Lifetime' : 'Mua một lần / Trọn đời',
    lookupPlaceholder: en ? 'Enter account ID, email, username or public UUID' : 'Nhập mã tài khoản, email, username hoặc public UUID',
    lookupBtn: en ? 'Look up' : 'Tra cứu',
    paymentUnavailableNotice: en
      ? 'Payment transaction subsystem is currently pending PS-80 integration. Real transaction queries are not available in this environment.'
      : 'Nguồn dữ liệu giao dịch thanh toán phụ thuộc phân hệ PS-80 (chưa tích hợp). Chức năng tra cứu giao dịch hiện chưa khả dụng trên môi trường này.',
    conflictBanner: en
      ? 'Plan configuration was modified by another administrator. Please reload data.'
      : 'Cấu hình gói đã bị thay đổi bởi quản trị viên khác. Vui lòng tải lại dữ liệu.',
  };

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    setPlansError(null);
    try {
      const data = await fetchAdminPlans({ accessToken, lang });
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.status === 401 && onUnauthorized) {
        onUnauthorized();
        return;
      }
      setPlansError(err);
    } finally {
      setLoadingPlans(false);
    }
  }, [accessToken, lang, onUnauthorized]);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      try {
        const data = await fetchAdminPlans({ accessToken, lang });
        if (!ignore) {
          setPlans(Array.isArray(data) ? data : []);
          setPlansError(null);
        }
      } catch (err) {
        if (!ignore) {
          if (err.status === 401 && onUnauthorized) {
            onUnauthorized();
            return;
          }
          setPlansError(err);
        }
      } finally {
        if (!ignore) {
          setLoadingPlans(false);
        }
      }
    };
    run();
    return () => {
      ignore = true;
    };
  }, [accessToken, lang, onUnauthorized]);

  const openPlanDetail = async (planCode) => {
    setSelectedPlanCode(planCode);
    setLoadingDetail(true);
    setDetailError(null);
    setActionSuccess(null);
    try {
      const data = await fetchAdminPlanDetail(planCode, { accessToken, lang });
      setPlanDetail(data);
    } catch (err) {
      if (err.status === 401 && onUnauthorized) {
        onUnauthorized();
        return;
      }
      setDetailError(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleStartCreateDraft = (sourceVersion) => {
    if (!sourceVersion) return;
    setSaveError(null);
    setActionSuccess(null);
    setEditingVersion({
      isNewDraft: true,
      planCode: sourceVersion.planCode,
      sourceVersionId: sourceVersion.id,
      version: sourceVersion.version + 1,
    });
    setEditFormData({
      nameVi: sourceVersion.nameVi || '',
      nameEn: sourceVersion.nameEn || '',
      descriptionVi: sourceVersion.descriptionVi || '',
      descriptionEn: sourceVersion.descriptionEn || '',
      purchasePriceVnd: sourceVersion.purchasePriceVnd || 0,
      assetLimit: sourceVersion.assetLimit || 5,
      storageBytesLimit: sourceVersion.storageBytesLimit || 104857600,
      fileBytesLimit: 10485760, // strictly 10 MB
      changeNotes: '',
      concurrencyToken: 0,
    });
  };

  const handleStartEditDraft = (draftVer) => {
    setSaveError(null);
    setActionSuccess(null);
    setEditingVersion({
      isNewDraft: false,
      planCode: draftVer.planCode,
      version: draftVer.version,
      id: draftVer.id,
    });
    setEditFormData({
      nameVi: draftVer.nameVi || '',
      nameEn: draftVer.nameEn || '',
      descriptionVi: draftVer.descriptionVi || '',
      descriptionEn: draftVer.descriptionEn || '',
      purchasePriceVnd: draftVer.purchasePriceVnd || 0,
      assetLimit: draftVer.assetLimit || 5,
      storageBytesLimit: draftVer.storageBytesLimit || 104857600,
      fileBytesLimit: 10485760,
      changeNotes: draftVer.changeNotes || '',
      concurrencyToken: draftVer.concurrencyToken != null ? draftVer.concurrencyToken : 0,
    });
  };

  const handleSaveDraft = async (e) => {
    e.preventDefault();
    if (!editingVersion) return;
    setSavingVersion(true);
    setSaveError(null);
    try {
      if (editingVersion.isNewDraft) {
        await createAdminPlanDraft(
          editingVersion.planCode,
          {
            sourceVersionId: editingVersion.sourceVersionId,
            changeNotes: editFormData.changeNotes,
          },
          { accessToken, lang }
        );
        setActionSuccess(en ? 'Draft created successfully!' : 'Đã tạo bản nháp mới thành công!');
      } else {
        await updateAdminPlanDraft(
          editingVersion.planCode,
          editingVersion.version,
          {
            nameVi: editFormData.nameVi,
            nameEn: editFormData.nameEn,
            descriptionVi: editFormData.descriptionVi,
            descriptionEn: editFormData.descriptionEn,
            purchasePriceVnd: Number(editFormData.purchasePriceVnd),
            billingModel: 'LIFETIME',
            assetLimit: Number(editFormData.assetLimit),
            storageBytesLimit: Number(editFormData.storageBytesLimit),
            fileBytesLimit: 10485760,
            concurrencyToken: editFormData.concurrencyToken,
            changeNotes: editFormData.changeNotes,
          },
          { accessToken, lang }
        );
        setActionSuccess(en ? 'Draft updated successfully!' : 'Đã cập nhật bản nháp thành công!');
      }
      setEditingVersion(null);
      await openPlanDetail(editingVersion.planCode);
      await loadPlans();
    } catch (err) {
      if (err.status === 401 && onUnauthorized) {
        onUnauthorized();
        return;
      }
      setSaveError(err);
    } finally {
      setSavingVersion(false);
    }
  };

  const handlePublish = async (planCode, version) => {
    if (!window.confirm(en ? `Publish version ${version} for ${planCode}? Earlier version will be deprecated.` : `Công bố phiên bản ${version} cho gói ${planCode}? Phiên bản trước sẽ tự động ngừng áp dụng.`)) {
      return;
    }
    setLoadingDetail(true);
    setDetailError(null);
    try {
      await publishAdminPlanVersion(planCode, version, { accessToken, lang });
      setActionSuccess(en ? `Version ${version} published successfully!` : `Đã công bố phiên bản ${version} thành công!`);
      await openPlanDetail(planCode);
      await loadPlans();
    } catch (err) {
      setDetailError(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDeprecate = async (planCode, version) => {
    if (!window.confirm(en ? `Deprecate version ${version} for ${planCode}? It will no longer be offered for new purchases.` : `Ngừng áp dụng phiên bản ${version} của gói ${planCode}? Phiên bản sẽ không còn khả dụng cho lượt đăng ký mới.`)) {
      return;
    }
    setLoadingDetail(true);
    setDetailError(null);
    try {
      await deprecateAdminPlanVersion(planCode, version, { accessToken, lang });
      setActionSuccess(en ? `Version ${version} deprecated.` : `Đã ngừng áp dụng phiên bản ${version}.`);
      await openPlanDetail(planCode);
      await loadPlans();
    } catch (err) {
      setDetailError(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleLookupAccount = async (e) => {
    e.preventDefault();
    const q = accountQuery.trim();
    if (!q) return;
    setLoadingAccount(true);
    setAccountError(null);
    setAccountData(null);
    try {
      const res = await lookupAdminAccount(q, { accessToken, lang });
      setAccountData(res);
    } catch (err) {
      setAccountError(err);
    } finally {
      setLoadingAccount(false);
    }
  };

  return (
    <div className="lv-admin-sub-page">
      <header className="lv-admin-sub-header">
        {onNavigateHome && (
          <button
            type="button"
            className="lv-admin-sub-back-link"
            onClick={onNavigateHome}
          >
            {en ? '← Back to Admin Overview' : '← Quay lại Tổng quan Quản trị'}
          </button>
        )}
        <h1 className="lv-admin-sub-title">{t.title}</h1>
        <p className="lv-admin-sub-subtitle">{t.subtitle}</p>
      </header>

      <nav className="lv-admin-sub-tabs" aria-label="Subscription sub-navigation">
        <button
          type="button"
          className={`lv-admin-sub-tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          {t.tabCatalog}
        </button>
        <button
          type="button"
          className={`lv-admin-sub-tab-btn ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          {t.tabAccounts}
        </button>
        <button
          type="button"
          className={`lv-admin-sub-tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          {t.tabTransactions}
        </button>
      </nav>

      {actionSuccess && (
        <div className="lv-admin-sub-alert lv-admin-sub-alert--success" role="status">
          {actionSuccess}
        </div>
      )}

      {/* TAB 1: CATALOG & VERSION MANAGEMENT */}
      {activeTab === 'catalog' && (
        <div className="lv-admin-sub-content">
          <div className="lv-admin-sub-toolbar">
            <button
              type="button"
              className="lv-admin-sub-btn lv-admin-sub-btn--secondary"
              onClick={loadPlans}
              disabled={loadingPlans}
            >
              {loadingPlans ? (en ? 'Refreshing...' : 'Đang làm mới...') : (en ? '🔄 Refresh' : '🔄 Làm mới danh sách')}
            </button>
          </div>

          {plansError && (
            <div className="lv-admin-sub-alert lv-admin-sub-alert--error" role="alert">
              {adminSubscriptionErrorMessage(plansError, lang)}
            </div>
          )}

          {loadingPlans && <div className="lv-admin-sub-loading">{en ? 'Loading plans...' : 'Đang tải danh sách gói...'}</div>}

          {!loadingPlans && plans.length > 0 && (
            <div className="lv-admin-sub-grid">
              {plans.map((p) => {
                const isSelected = selectedPlanCode === p.planCode;
                const isFree = p.activePriceVnd === 0;
                return (
                  <div
                    key={p.planCode}
                    className={`lv-admin-sub-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => openPlanDetail(p.planCode)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPlanDetail(p.planCode); }}
                  >
                    <div className="lv-admin-sub-card-header">
                      <h3 className="lv-admin-sub-card-name">{en ? p.nameEn : p.nameVi}</h3>
                      <span className="lv-admin-sub-badge lv-admin-sub-badge--code">{p.planCode}</span>
                    </div>

                    <div className="lv-admin-sub-card-price">
                      {isFree ? (
                        <span className="lv-admin-sub-price-num">{t.freePrice}</span>
                      ) : (
                        <>
                          <span className="lv-admin-sub-price-num">{formatVnd(p.activePriceVnd, lang)}</span>
                        </>
                      )}
                    </div>

                    <div className="lv-admin-sub-card-limits">
                      <div className="lv-admin-sub-limit-item">
                        <span className="lv-admin-sub-limit-label">{t.assetsLimit}</span>
                        <span className="lv-admin-sub-limit-value">{p.limits?.assetCount}</span>
                      </div>
                      <div className="lv-admin-sub-limit-item">
                        <span className="lv-admin-sub-limit-label">{t.storageLimit}</span>
                        <span className="lv-admin-sub-limit-value">{formatBytes(p.limits?.storageBytes)}</span>
                      </div>
                      <div className="lv-admin-sub-limit-item">
                        <span className="lv-admin-sub-limit-label">{t.fileLimit}</span>
                        <span className="lv-admin-sub-limit-value">10 MB</span>
                      </div>
                    </div>

                    <div className="lv-admin-sub-card-footer">
                      <span className="lv-admin-sub-version-badge">
                        v{p.activeVersion} ({t.activeTag})
                      </span>
                      {p.hasDraft && (
                        <span className="lv-admin-sub-badge lv-admin-sub-badge--draft">
                          v{p.draftVersion} {t.draftTag}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PLAN DETAIL & VERSION HISTORY DRAWER */}
          {selectedPlanCode && (
            <section className="lv-admin-sub-detail-panel" aria-label="Plan details and history">
              <div className="lv-admin-sub-detail-header">
                <h2>
                  {en ? 'Plan History:' : 'Lịch sử cấu hình:'} {planDetail?.nameVi || selectedPlanCode} ({selectedPlanCode})
                </h2>
                <div className="lv-admin-sub-detail-actions">
                  {planDetail && !planDetail.versions?.some(v => v.status === 'DRAFT') && (
                    <button
                      type="button"
                      className="lv-admin-sub-btn lv-admin-sub-btn--primary"
                      onClick={() => {
                        const latest = planDetail.versions?.[0];
                        handleStartCreateDraft(latest);
                      }}
                    >
                      {t.createDraft}
                    </button>
                  )}
                  <button
                    type="button"
                    className="lv-admin-sub-btn lv-admin-sub-btn--text"
                    onClick={() => setSelectedPlanCode(null)}
                  >
                    {en ? 'Close ✕' : 'Đóng ✕'}
                  </button>
                </div>
              </div>

              {loadingDetail && <div className="lv-admin-sub-loading">{en ? 'Loading history...' : 'Đang tải lịch sử...'}</div>}

              {detailError && (
                <div className="lv-admin-sub-alert lv-admin-sub-alert--error" role="alert">
                  {adminSubscriptionErrorMessage(detailError, lang)}
                </div>
              )}

              {planDetail && !loadingDetail && (
                <div className="lv-admin-sub-versions-list">
                  <table className="lv-admin-sub-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>{en ? 'Status' : 'Trạng thái'}</th>
                        <th>{en ? 'Name' : 'Tên hiển thị'}</th>
                        <th>{en ? 'Purchase Price' : 'Giá mua'}</th>
                        <th>{en ? 'Assets' : 'Tài sản'}</th>
                        <th>{en ? 'Storage' : 'Lưu trữ'}</th>
                        <th>{en ? 'Change Note' : 'Ghi chú'}</th>
                        <th>{en ? 'Actions' : 'Thao tác'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planDetail.versions?.map((v) => {
                        const isDraft = v.status === 'DRAFT';
                        const isPublished = v.status === 'PUBLISHED';
                        return (
                          <tr key={v.id} className={isDraft ? 'row-draft' : isPublished ? 'row-active' : ''}>
                            <td className="cell-version">v{v.version}</td>
                            <td>
                              <span className={`lv-admin-sub-badge lv-admin-sub-badge--${v.status.toLowerCase()}`}>
                                {v.status}
                              </span>
                            </td>
                            <td>{en ? v.nameEn : v.nameVi}</td>
                            <td>{v.billingModel === 'MONTHLY'
                              ? `${new Intl.NumberFormat(en ? 'en-US' : 'vi-VN').format(v.legacyMonthlyPriceVnd ?? 0)} VND ${en ? '/ month (history)' : '/ tháng (lịch sử)'}`
                              : v.purchasePriceVnd === 0 ? t.freePrice : formatVnd(v.purchasePriceVnd, lang)}</td>
                            <td>{v.assetLimit}</td>
                            <td>{formatBytes(v.storageBytesLimit)}</td>
                            <td className="cell-note">{v.changeNotes || '—'}</td>
                            <td className="cell-actions">
                              {isDraft && (
                                <>
                                  <button
                                    type="button"
                                    className="lv-admin-sub-btn-sm lv-admin-sub-btn--primary"
                                    onClick={() => handleStartEditDraft(v)}
                                  >
                                    {t.editDraft}
                                  </button>
                                  <button
                                    type="button"
                                    className="lv-admin-sub-btn-sm lv-admin-sub-btn--gold"
                                    onClick={() => handlePublish(selectedPlanCode, v.version)}
                                  >
                                    {t.publish}
                                  </button>
                                </>
                              )}
                              {isPublished && (
                                <button
                                  type="button"
                                  className="lv-admin-sub-btn-sm lv-admin-sub-btn--danger"
                                  onClick={() => handleDeprecate(selectedPlanCode, v.version)}
                                >
                                  {t.deprecate}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* EDIT DRAFT MODAL */}
          {editingVersion && (
            <div className="lv-admin-sub-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
              <div className="lv-admin-sub-modal">
                <div className="lv-admin-sub-modal-header">
                  <h3 id="modal-title">
                    {editingVersion.isNewDraft
                      ? (en ? `Create Draft for ${editingVersion.planCode} (v${editingVersion.version})` : `Tạo bản nháp cho ${editingVersion.planCode} (v${editingVersion.version})`)
                      : (en ? `Edit Draft for ${editingVersion.planCode} (v${editingVersion.version})` : `Chỉnh sửa bản nháp cho ${editingVersion.planCode} (v${editingVersion.version})`)}
                  </h3>
                  <button
                    type="button"
                    className="lv-admin-sub-modal-close"
                    onClick={() => setEditingVersion(null)}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveDraft} className="lv-admin-sub-form">
                  {saveError && (
                    <div className="lv-admin-sub-alert lv-admin-sub-alert--error" role="alert">
                      {adminSubscriptionErrorMessage(saveError, lang)}
                      {(saveError.code === 'PLAN_VERSION_CONFLICT' || saveError.code === 'OPTIMISTIC_LOCK_CONFLICT') && (
                        <div style={{ marginTop: '8px' }}>
                          <button
                            type="button"
                            className="lv-admin-sub-btn lv-admin-sub-btn--secondary"
                            onClick={() => {
                              openPlanDetail(editingVersion.planCode);
                              setEditingVersion(null);
                            }}
                          >
                            {t.reloadCatalog}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!editingVersion.isNewDraft && (
                    <>
                      <div className="lv-admin-sub-form-row">
                        <div className="lv-admin-sub-form-group">
                          <label htmlFor="f-nameVi">{en ? 'Plan Name (VI) *' : 'Tên gói (Tiếng Việt) *'}</label>
                          <input
                            id="f-nameVi"
                            type="text"
                            required
                            maxLength={100}
                            value={editFormData.nameVi}
                            onChange={(e) => setEditFormData({ ...editFormData, nameVi: e.target.value })}
                          />
                        </div>
                        <div className="lv-admin-sub-form-group">
                          <label htmlFor="f-nameEn">{en ? 'Plan Name (EN) *' : 'Tên gói (Tiếng Anh) *'}</label>
                          <input
                            id="f-nameEn"
                            type="text"
                            required
                            maxLength={100}
                            value={editFormData.nameEn}
                            onChange={(e) => setEditFormData({ ...editFormData, nameEn: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="lv-admin-sub-form-group">
                        <label htmlFor="f-descVi">{en ? 'Description (VI)' : 'Mô tả (Tiếng Việt)'}</label>
                        <textarea
                          id="f-descVi"
                          rows={2}
                          maxLength={500}
                          value={editFormData.descriptionVi}
                          onChange={(e) => setEditFormData({ ...editFormData, descriptionVi: e.target.value })}
                        />
                      </div>

                      <div className="lv-admin-sub-form-group">
                        <label htmlFor="f-descEn">{en ? 'Description (EN)' : 'Mô tả (Tiếng Anh)'}</label>
                        <textarea
                          id="f-descEn"
                          rows={2}
                          maxLength={500}
                          value={editFormData.descriptionEn}
                          onChange={(e) => setEditFormData({ ...editFormData, descriptionEn: e.target.value })}
                        />
                      </div>

                      <div className="lv-admin-sub-form-row">
                        <div className="lv-admin-sub-form-group">
                          <label htmlFor="f-price">{en ? 'Purchase Price (VND) *' : 'Giá mua một lần (VND) *'}</label>
                          <input
                            id="f-price"
                            type="number"
                            required
                            min={0}
                            disabled={editingVersion.planCode === 'BASIC'}
                            value={editFormData.purchasePriceVnd}
                            onChange={(e) => setEditFormData({ ...editFormData, purchasePriceVnd: e.target.value })}
                          />
                          {editingVersion.planCode === 'BASIC' && (
                            <small className="lv-admin-sub-hint">{en ? 'Basic plan is strictly free (0 VND).' : 'Gói Cơ bản luôn miễn phí (0 VND).'}</small>
                          )}
                        </div>

                        <div className="lv-admin-sub-form-group">
                          <label htmlFor="f-billing">{t.billingCycleLabel}</label>
                          <input
                            id="f-billing"
                            type="text"
                            disabled
                            value={t.billingMonthlyOnly}
                          />
                        </div>
                      </div>

                      <div className="lv-admin-sub-form-row">
                        <div className="lv-admin-sub-form-group">
                          <label htmlFor="f-assets">{en ? 'Asset Quota (count) *' : 'Hạn mức tài sản *'}</label>
                          <input
                            id="f-assets"
                            type="number"
                            required
                            min={1}
                            value={editFormData.assetLimit}
                            onChange={(e) => setEditFormData({ ...editFormData, assetLimit: e.target.value })}
                          />
                        </div>

                        <div className="lv-admin-sub-form-group">
                          <label htmlFor="f-storage">{en ? 'Storage Limit (Bytes) *' : 'Dung lượng lưu trữ (Bytes) *'}</label>
                          <input
                            id="f-storage"
                            type="number"
                            required
                            min={10485760}
                            value={editFormData.storageBytesLimit}
                            onChange={(e) => setEditFormData({ ...editFormData, storageBytesLimit: e.target.value })}
                          />
                          <small className="lv-admin-sub-hint">
                            {formatBytes(Number(editFormData.storageBytesLimit))}
                          </small>
                        </div>
                      </div>

                      <div className="lv-admin-sub-form-group">
                        <label htmlFor="f-fileLimit">{en ? 'Max File Size' : 'Kích thước tệp tối đa'}</label>
                        <input
                          id="f-fileLimit"
                          type="text"
                          disabled
                          value={t.standardFilePolicy}
                        />
                      </div>
                    </>
                  )}

                  <div className="lv-admin-sub-form-group">
                    <label htmlFor="f-notes">{en ? 'Change Notes' : 'Ghi chú thay đổi'}</label>
                    <textarea
                      id="f-notes"
                      rows={2}
                      maxLength={500}
                      placeholder={en ? 'Reason for this version update...' : 'Lý do cập nhật phiên bản...'}
                      value={editFormData.changeNotes}
                      onChange={(e) => setEditFormData({ ...editFormData, changeNotes: e.target.value })}
                    />
                  </div>

                  <div className="lv-admin-sub-modal-footer">
                    <button
                      type="button"
                      className="lv-admin-sub-btn lv-admin-sub-btn--secondary"
                      onClick={() => setEditingVersion(null)}
                      disabled={savingVersion}
                    >
                      {en ? 'Cancel' : 'Hủy bỏ'}
                    </button>
                    <button
                      type="submit"
                      className="lv-admin-sub-btn lv-admin-sub-btn--primary"
                      disabled={savingVersion}
                    >
                      {savingVersion ? (en ? 'Saving...' : 'Đang lưu...') : (en ? 'Save Version' : 'Lưu phiên bản')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACCOUNT USAGE REAL LOOKUP */}
      {activeTab === 'accounts' && (
        <div className="lv-admin-sub-content">
          <form onSubmit={handleLookupAccount} className="lv-admin-sub-search-form">
            <input
              type="text"
              placeholder={t.lookupPlaceholder}
              value={accountQuery}
              onChange={(e) => setAccountQuery(e.target.value)}
              className="lv-admin-sub-search-input"
            />
            <button
              type="submit"
              className="lv-admin-sub-btn lv-admin-sub-btn--primary"
              disabled={loadingAccount || !accountQuery.trim()}
            >
              {loadingAccount ? (en ? 'Searching...' : 'Đang tìm...') : t.lookupBtn}
            </button>
          </form>

          {accountError && (
            <div className="lv-admin-sub-alert lv-admin-sub-alert--error" role="alert">
              {adminSubscriptionErrorMessage(accountError, lang)}
            </div>
          )}

          {accountData && (
            <div className="lv-admin-sub-account-result">
              <div className="lv-admin-sub-account-header">
                <div>
                  <h3>{accountData.username}</h3>
                  <span className="lv-admin-sub-text-muted">{accountData.email}</span>
                  <div className="lv-admin-sub-id-badge">ID: {accountData.accountId}</div>
                </div>
                <div className="lv-admin-sub-badge lv-admin-sub-badge--published">
                  {accountData.effectivePlanName}
                </div>
              </div>

              <div className="lv-admin-sub-meta-grid">
                <div className="lv-admin-sub-meta-box">
                  <span className="lv-admin-sub-meta-label">{en ? 'Effective Plan' : 'Gói hiệu lực'}</span>
                  <span className="lv-admin-sub-meta-val">{accountData.effectivePlanCode}</span>
                </div>
                <div className="lv-admin-sub-meta-box">
                  <span className="lv-admin-sub-meta-label">{en ? 'Plan Status' : 'Trạng thái gói'}</span>
                  <span className="lv-admin-sub-meta-val">{accountData.effectivePlanStatus}</span>
                </div>
                <div className="lv-admin-sub-meta-box">
                  <span className="lv-admin-sub-meta-label">{en ? 'Entitlement Status' : 'Quyền sử dụng'}</span>
                  <span className="lv-admin-sub-meta-val">{accountData.entitlementStatus}</span>
                </div>
                <div className="lv-admin-sub-meta-box">
                  <span className="lv-admin-sub-meta-label">{en ? 'Billing Model' : 'Mô hình thanh toán'}</span>
                  <span className="lv-admin-sub-meta-val">{accountData.billingModel}</span>
                </div>
                <div className="lv-admin-sub-meta-box">
                  <span className="lv-admin-sub-meta-label">{en ? 'Vault Created' : 'Kho di sản'}</span>
                  <span className="lv-admin-sub-meta-val">{accountData.hasVault ? (en ? 'Created' : 'Đã tạo') : (en ? 'None' : 'Chưa tạo')}</span>
                </div>
                <div className="lv-admin-sub-meta-box">
                  <span className="lv-admin-sub-meta-label">{en ? 'Effective Expiration' : 'Hạn hiệu lực'}</span>
                  <span className="lv-admin-sub-meta-val">{accountData.effectiveUntil ? new Date(accountData.effectiveUntil).toLocaleDateString() : (en ? 'Indefinite' : 'Không thời hạn')}</span>
                </div>
              </div>

              <div className="lv-admin-sub-gauges">
                <div className="lv-admin-sub-gauge">
                  <div className="lv-admin-sub-gauge-title">
                    <span>{t.assetsLimit}</span>
                    <span>{accountData.assetCount} / {accountData.assetLimit}</span>
                  </div>
                  <div className="lv-admin-sub-bar">
                    <div
                      className="lv-admin-sub-bar-fill"
                      style={{ width: `${Math.min(100, (accountData.assetCount / accountData.assetLimit) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="lv-admin-sub-gauge">
                  <div className="lv-admin-sub-gauge-title">
                    <span>{t.storageLimit}</span>
                    <span>{formatBytes(accountData.storageBytes)} / {formatBytes(accountData.storageBytesLimit)}</span>
                  </div>
                  <div className="lv-admin-sub-bar">
                    <div
                      className="lv-admin-sub-bar-fill"
                      style={{ width: `${Math.min(100, (accountData.storageBytes / accountData.storageBytesLimit) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PAYMENT TRANSACTIONS (DEPENDENCY STATUS) */}
      {activeTab === 'transactions' && (
        <div className="lv-admin-sub-content">
          <div className="lv-admin-sub-warning-panel" role="region" aria-label="Payment Subsystem Status">
            <div className="lv-admin-sub-warning-icon">⏳</div>
            <div className="lv-admin-sub-warning-body">
              <h3>{en ? 'Payment Transactions Dependency (PS-80)' : 'Phụ thuộc phân hệ thanh toán (PS-80)'}</h3>
              <p>{t.paymentUnavailableNotice}</p>
              <ul>
                <li>{en ? 'Admin catalog management functions independently.' : 'Phân hệ quản lý danh mục gói Admin hoạt động độc lập.'}</li>
                <li>{en ? 'No synthetic or simulated transaction history is fabricated.' : 'Tuyệt đối không giả mạo giao dịch thanh toán hoặc trả danh sách rỗng 200.'}</li>
                <li>{en ? 'Integration with VNPay/MoMo gateways will provide live transaction streams once PS-80 is merged.' : 'Kết nối với cổng thanh toán VNPay/MoMo sẽ tự động cung cấp luồng giao dịch thật khi PS-80 hoàn tất tích hợp.'}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
