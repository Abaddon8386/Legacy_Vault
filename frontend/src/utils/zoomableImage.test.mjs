import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('every image viewer goes through the shared zoom control', () => {
  for (const file of ['components/common/EvidencePreviewModal.jsx', 'components/assets/AssetImageGallery.jsx',
    'pages/legal/LegalEvidenceFiles.jsx', 'pages/beneficiary/ReceivedAssets.jsx', 'pages/wills/WillUploadPage.jsx']) {
    assert.match(source(file), /<ZoomableImage /, file);
  }
});

test('an image declared as image/* opens as an image even when its name ends in .pdf', () => {
  const modal = source('components/common/EvidencePreviewModal.jsx');
  assert.match(modal, /isPdf = !isDeclaredImage/);
  assert.match(source('pages/staff/StaffLegalDocumentsPage.jsx'), /'image\/jpeg': '\.jpg'/);
});

test('zoom control has labelled buttons and bounded steps', () => {
  const zoom = source('components/common/ZoomableImage.jsx');
  assert.match(zoom, /MIN_ZOOM = 50, MAX_ZOOM = 300, ZOOM_STEP = 25/);
  for (const label of ['Thu nhỏ', 'Phóng to', 'Zoom out', 'Zoom in']) assert.ok(zoom.includes(label), label);
  assert.equal((zoom.match(/type="button"/g) || []).length, 3);
});

test('staff screens no longer link back to the handover session', () => {
  for (const file of ['BeneficiaryConfirmationPage', 'CloseAndArchivePage', 'CompletionProgressPage', 'ScopedAssetHandoverPage']) {
    assert.doesNotMatch(source(`pages/staff/${file}.jsx`), /Quay lại Phiên bàn giao tại quầy/, file);
  }
});
