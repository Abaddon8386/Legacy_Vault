import { LegalTechnicalDetails } from './LegalRecordDetails.jsx';

export default function LegalAllocations({ version, lang }) {
  const en = lang === 'en';
  const allocations = version?.allocations;
  const headings = en ? ['Asset', 'Recipient', 'Allocation', 'Recipient origin'] : ['Tài sản', 'Người nhận', 'Phần được hưởng', 'Nguồn người nhận'];
  const assetTypes = { TEXT: ['Thông tin', 'Information'], CREDENTIAL: ['Tài khoản số', 'Digital account'], FILE: ['Tệp', 'File'], DOCUMENT: ['Tài liệu', 'Document'] };
  const reference = (id, recipient = false) => <LegalTechnicalDetails en={en} rows={[[recipient ? (en ? 'Recipient reference' : 'Mã người nhận') : (en ? 'Asset reference' : 'Mã tài sản'), id]]} />;
  const cell = (heading, content) => <td role="cell"><span className="lv-legal-allocation-mobile-label" aria-hidden="true">{heading}</span><div className="lv-legal-allocation-cell">{content}</div></td>;
  return <section className="lv-legal-allocations" aria-label={en ? `Allocations — version ${version.version}` : `Phân bổ — phiên bản ${version.version}`}>
    <h3>{en ? 'Asset allocations' : 'Thông tin phân bổ tài sản'}</h3>
    <p>{en ? `Document version ${version.version}` : `Phiên bản văn bản ${version.version}`}{version.documentNumber ? ` · ${version.documentNumber}` : ''}</p>
    {!allocations?.length ? <p>{en ? 'No allocation details are available in this version.' : 'Phiên bản này chưa có thông tin phân bổ để hiển thị.'}</p>
      : <>
        {allocations.some(item => item.accountLinked === false) && <p className="lv-legal-help">{en ? 'An unlinked account does not block Legal approval. Staff must confirm the account link before handing assets to that recipient.' : 'Chưa liên kết tài khoản không chặn phê duyệt pháp lý. Nhân viên cần xác nhận liên kết trước khi bàn giao cho người nhận đó.'}</p>}
        <table role="table">
          <caption>{en ? `Allocations in document version ${version.version}` : `Phân bổ trong văn bản phiên bản ${version.version}`}</caption>
          <thead role="rowgroup"><tr role="row">{headings.map(heading => <th key={heading} role="columnheader" scope="col">{heading}</th>)}</tr></thead>
          <tbody role="rowgroup">{allocations.map((item, index) => <tr role="row" key={`${item.assetId}:${item.beneficiaryId}:${index}`}>
            {cell(headings[0], <><strong>{item.assetName || (en ? 'Asset name unavailable' : 'Chưa có tên tài sản')}</strong>{assetTypes[item.assetType] && <small>{assetTypes[item.assetType][en ? 1 : 0]}</small>}{reference(item.assetId)}</>)}
            {cell(headings[1], <><strong>{item.recipientName || (en ? 'Recipient name unavailable' : 'Chưa có tên người nhận')}</strong>
              <small>{item.accountLinked === true ? (en ? 'Account linked' : 'Đã liên kết tài khoản') : item.accountLinked === false ? (en ? 'Account not linked' : 'Chưa liên kết tài khoản') : (en ? 'Account link not provided' : 'Chưa có thông tin liên kết')}</small>{reference(item.beneficiaryId, true)}</>)}
            {cell(headings[2], <p>{item.description || (en ? 'Not provided in this document' : 'Chưa có mô tả trong văn bản')}</p>)}
            {cell(headings[3], <><strong className={item.recipientSource === 'COURT_DOCUMENT' ? 'lv-legal-court-recipient' : undefined}>
              {item.recipientSource === 'COURT_DOCUMENT' ? (en ? 'Court document' : 'Từ văn bản Tòa án') : item.recipientSource === 'OWNER_DESIGNATED' ? (en ? 'Designated by Owner' : 'Chủ kho khai báo') : (en ? 'Origin not provided' : 'Chưa có thông tin nguồn')}</strong>
              {item.recipientSource === 'COURT_DOCUMENT' && <small>{item.sourceVersionNo ? (en ? `Named in version ${item.sourceVersionNo}` : `Ghi nhận từ phiên bản ${item.sourceVersionNo}`) : (en ? 'Source version not provided' : 'Chưa có phiên bản nguồn')}</small>}</>)}
          </tr>)}</tbody>
        </table>
      </>}
  </section>;
}
