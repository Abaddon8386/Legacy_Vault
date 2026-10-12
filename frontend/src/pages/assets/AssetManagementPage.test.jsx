import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AssetManagementPage } from './AssetManagementPage'
import { translations } from '../../i18n/translations'
import { assetService } from '../../services/assetService'
import { assetMock } from '../../mocks/assetMock'

describe('AssetManagementPage Contract-Aligned UI Tests (PS-5)', () => {
  const t = translations.vi

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  const mockAssets = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      vaultId: '00000000-0000-0000-0000-000000000001',
      name: 'Di chúc và tâm nguyện gia đình',
      assetType: 'TEXT',
      description: 'Ghi chú về phân định tài sản cho con cái',
      hasPayload: true,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      vaultId: '00000000-0000-0000-0000-000000000001',
      name: 'Mật khẩu ví lạnh Ledger',
      assetType: 'CREDENTIAL',
      description: 'Cụm từ phục hồi bí mật để trong két',
      hasPayload: true,
      createdAt: '2026-09-10T00:00:00Z',
      updatedAt: '2026-09-10T00:00:00Z',
    },
  ]

  it('renders loading state initially and then shows asset list with summary cards', async () => {
    vi.spyOn(assetService, 'getAssets').mockResolvedValue({ content: mockAssets, totalElements: mockAssets.length })

    render(<AssetManagementPage t={t} />)

    // Check loading indicator is shown initially
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Wait for assets to render
    await waitFor(() => {
      expect(screen.getAllByText('Di chúc và tâm nguyện gia đình').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Mật khẩu ví lạnh Ledger').length).toBeGreaterThan(0)
    })

    // Check Summary card values
    expect(screen.getByText(t.assets.stats.totalCount)).toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText(t.assets.stats.securityStatus).length).toBeGreaterThan(0)

    // Business rule banner check
    expect(
      screen.getByText(/Lưu ý pháp lý: Tài sản lưu trong hệ thống mang tính chất ghi nhận/i)
    ).toBeInTheDocument()
  })

  it('collapses legal notice when clicking "Đã hiểu" and shows ⓘ icon', async () => {
    vi.spyOn(assetService, 'getAssets').mockResolvedValue({ content: mockAssets, totalElements: mockAssets.length })

    render(<AssetManagementPage t={t} />)

    await waitFor(() => {
      expect(screen.getByText(t.assets.noticeDismiss)).toBeInTheDocument()
    })

    // Click "Đã hiểu"
    const dismissBtn = screen.getByText(t.assets.noticeDismiss)
    fireEvent.click(dismissBtn)

    // Banner should be removed from view
    expect(screen.queryByText(t.assets.noticeDismiss)).not.toBeInTheDocument()

    // Info pill button should be visible next to title
    expect(
      screen.getByRole('button', { name: new RegExp(t.assets.noticeInfoTooltip, 'i') })
    ).toBeInTheDocument()
  })

  it('filters assets by search keyword', async () => {
    vi.spyOn(assetService, 'getAssets').mockResolvedValue({ content: mockAssets, totalElements: mockAssets.length })

    render(<AssetManagementPage t={t} />)

    await waitFor(() => {
      expect(screen.getAllByText('Di chúc và tâm nguyện gia đình').length).toBeGreaterThan(0)
    })

    const searchInput = screen.getByPlaceholderText(t.assets.searchPlaceholder)
    fireEvent.change(searchInput, { target: { value: 'Ledger' } })

    expect(screen.getAllByText('Mật khẩu ví lạnh Ledger').length).toBeGreaterThan(0)
    expect(screen.queryByText('Di chúc và tâm nguyện gia đình')).not.toBeInTheDocument()
  })

  it('filters assets by assetType (TEXT vs CREDENTIAL)', async () => {
    vi.spyOn(assetService, 'getAssets').mockResolvedValue({ content: mockAssets, totalElements: mockAssets.length })

    render(<AssetManagementPage t={t} />)

    await waitFor(() => {
      expect(screen.getAllByText('Di chúc và tâm nguyện gia đình').length).toBeGreaterThan(0)
    })

    const typeSelect = screen.getByLabelText(t.assets.filterAria)
    fireEvent.change(typeSelect, { target: { value: 'CREDENTIAL' } })

    expect(screen.getAllByText('Mật khẩu ví lạnh Ledger').length).toBeGreaterThan(0)
    expect(screen.queryByText('Di chúc và tâm nguyện gia đình')).not.toBeInTheDocument()
  })

  it('validates required fields before allowing asset creation', async () => {
    vi.spyOn(assetService, 'getAssets').mockResolvedValue({ content: mockAssets, totalElements: mockAssets.length })

    render(<AssetManagementPage t={t} />)

    await waitFor(() => {
      expect(screen.getAllByText('Di chúc và tâm nguyện gia đình').length).toBeGreaterThan(0)
    })

    // Open Add Modal
    const addBtns = screen.getAllByRole('button', { name: new RegExp(t.assets.addNewBtn, 'i') })
    fireEvent.click(addBtns[0])

    expect(screen.getByRole('heading', { name: t.assets.addModal.title })).toBeInTheDocument()

    // Click submit without entering required inputs
    const submitBtn = screen.getByRole('button', { name: t.assets.addModal.submitBtn })
    fireEvent.click(submitBtn)

    // Expect validation errors for required contract fields
    expect(screen.getByText(t.assets.validation.nameRequired)).toBeInTheDocument()
    expect(screen.getByText(t.assets.validation.typeRequired)).toBeInTheDocument()
    expect(screen.getByText(t.assets.validation.payloadRequired)).toBeInTheDocument()

    // Non-blank short name (e.g. 1-2 chars) is valid (no min-3 requirement)
    const nameInput = screen.getByPlaceholderText(t.assets.addModal.namePlaceholder)
    fireEvent.change(nameInput, { target: { value: 'AB' } })
    fireEvent.click(submitBtn)
    expect(screen.queryByText(t.assets.validation.nameRequired)).not.toBeInTheDocument()
  })

  it('creates asset with write-only payload and ensures payload is not in DOM or localStorage', async () => {
    vi.spyOn(assetService, 'getAssets').mockResolvedValue({ content: mockAssets, totalElements: mockAssets.length })

    const secretPassword = 'SUPER_CONFIDENTIAL_KEY_987654321'
    const newMockAsset = {
      id: '33333333-3333-4333-8333-333333333333',
      vaultId: '00000000-0000-0000-0000-000000000001',
      name: 'Khóa API Server Bí Mật',
      assetType: 'CREDENTIAL',
      description: 'API Key giao dịch số',
      hasPayload: true,
      createdAt: '2026-10-12T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
    }
    vi.spyOn(assetService, 'createAsset').mockImplementation(async () => {
      assetService.getAssets.mockResolvedValue({ content: [newMockAsset, ...mockAssets], totalElements: 3 })
      return newMockAsset
    })

    render(<AssetManagementPage t={t} />)

    await waitFor(() => {
      expect(screen.getAllByText('Di chúc và tâm nguyện gia đình').length).toBeGreaterThan(0)
    })

    // Open Add Modal
    const addBtns = screen.getAllByRole('button', { name: new RegExp(t.assets.addNewBtn, 'i') })
    fireEvent.click(addBtns[0])

    // Fill form
    const nameInput = screen.getByPlaceholderText(t.assets.addModal.namePlaceholder)
    const typeSelect = document.getElementById('asset-type')
    const payloadInput = screen.getByPlaceholderText(t.assets.addModal.payloadPlaceholder)
    const descInput = screen.getByPlaceholderText(t.assets.addModal.descriptionPlaceholder)

    fireEvent.change(nameInput, { target: { value: 'Khóa API Server Bí Mật' } })
    fireEvent.change(typeSelect, { target: { value: 'CREDENTIAL' } })
    fireEvent.change(payloadInput, { target: { value: secretPassword } })
    fireEvent.change(descInput, { target: { value: 'API Key giao dịch số' } })

    const submitBtn = screen.getByRole('button', { name: t.assets.addModal.submitBtn })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getAllByText('Khóa API Server Bí Mật').length).toBeGreaterThan(0)
    })

    // Verify plaintext secret is NEVER rendered anywhere in the DOM
    expect(screen.queryByText(secretPassword)).not.toBeInTheDocument()

    // Test assetMock directly to verify plaintext payload is discarded and NOT saved to localStorage
    const createdByMock = await assetMock.createAsset({
      name: 'Mật mã thực tế',
      assetType: 'TEXT',
      description: 'Ghi chú',
      payload: 'SECRET_NEVER_SAVED_PLAINTEXT',
    })

    expect(createdByMock.hasPayload).toBe(true)
    expect(createdByMock.payload).toBeUndefined()

    // Inspect localStorage string
    const rawStorage = localStorage.getItem('legacyvault_mock_assets_v2') || ''
    expect(rawStorage).not.toContain('SECRET_NEVER_SAVED_PLAINTEXT')
  })

  it('handles error state gracefully with retry button', async () => {
    vi.spyOn(assetService, 'getAssets').mockRejectedValueOnce(new Error('Network error'))

    render(<AssetManagementPage t={t} />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(t.assets.alerts.loadError)).toBeInTheDocument()
    })

    // Ensure retry button is available
    expect(
      screen.getByRole('button', { name: new RegExp(t.assets.alerts.retryBtn, 'i') })
    ).toBeInTheDocument()
  })
})
