import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AssetManagementPage } from './AssetManagementPage'
import { translations } from '../../i18n/translations'
import { assetService } from '../../services/assetService'

const t = translations.vi
const vaultId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const item = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', vaultId, name: 'Private note', assetType: 'TEXT',
  hasPayload: true, createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z' }
const pageData = { content: [item], totalElements: 1 }
const page = props => <AssetManagementPage t={t} vaultId={vaultId} {...props} />
const openForm = () => fireEvent.click(screen.getAllByRole('button', { name: t.assets.addNewBtn })[0])
const fillForm = () => {
  fireEvent.change(screen.getByLabelText(/Tên tài sản/), { target: { value: 'New note' } })
  fireEvent.change(screen.getByLabelText(/^Loại tài sản/), { target: { value: 'TEXT' } })
  fireEvent.change(screen.getByLabelText(/^Nội dung bí mật/), { target: { value: '  PRIVATE SECRET  ' } })
}

beforeEach(() => { vi.spyOn(assetService, 'getAssets').mockResolvedValue(pageData) })
afterEach(() => vi.restoreAllMocks())

describe('PS-5 UI regression cases', () => {
  it('renders empty state and permits adding the first asset', async () => {
    assetService.getAssets.mockResolvedValue({ content: [], totalElements: 0 })
    render(page())
    expect(await screen.findByText(t.assets.emptyTitle)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: t.assets.addNewBtn })[0]).toBeEnabled()
  })

  it('refreshes and preserves explicit vault context', async () => {
    const view = render(page({ onRefreshTrigger: 0 }))
    await screen.findAllByText(item.name)
    view.rerender(page({ onRefreshTrigger: 1 }))
    await waitFor(() => expect(assetService.getAssets).toHaveBeenCalledTimes(2))
    expect(assetService.getAssets).toHaveBeenLastCalledWith(vaultId, expect.objectContaining({ page: 0, size: 10 }))
  })

  it('shows localized 401 and does not refetch just to change language', async () => {
    assetService.getAssets.mockRejectedValue({ code: 'UNAUTHENTICATED' })
    const onLogin = vi.fn()
    const view = render(page({ onNavigateToLogin: onLogin }))
    await screen.findByText(t.assets.alerts.UNAUTHENTICATED)
    fireEvent.click(screen.getByText(t.assets.signIn))
    expect(onLogin).toHaveBeenCalledOnce()
    view.rerender(page({ t: translations.en, lang: 'en', onNavigateToLogin: onLogin }))
    expect(screen.getByText(translations.en.assets.alerts.UNAUTHENTICATED)).toBeInTheDocument()
    expect(assetService.getAssets).toHaveBeenCalledOnce()
    expect(screen.getAllByRole('button', { name: translations.en.assets.addNewBtn })[0]).toBeDisabled()
  })

  it('supports retry after a failed load', async () => {
    assetService.getAssets.mockRejectedValueOnce({ code: 'NETWORK_ERROR' }).mockResolvedValueOnce(pageData)
    render(page())
    await screen.findByText(t.assets.alerts.NETWORK_ERROR)
    fireEvent.click(screen.getByText(t.assets.alerts.retryBtn))
    expect((await screen.findAllByText(item.name)).length).toBeGreaterThan(0)
  })

  it('requests the next server page and resets to page 0 when sorting', async () => {
    assetService.getAssets.mockResolvedValue({ content: [item], totalElements: 25 })
    render(page())
    await screen.findAllByText(item.name)
    fireEvent.click(screen.getByRole('button', { name: t.assets.pagination.next }))
    await waitFor(() => expect(assetService.getAssets).toHaveBeenLastCalledWith(vaultId, expect.objectContaining({ page: 1 })))
    await screen.findAllByText(item.name)
    fireEvent.keyDown(screen.getByText(t.assets.colName).closest('th'), { key: 'Enter' })
    await waitFor(() => expect(assetService.getAssets).toHaveBeenLastCalledWith(vaultId, expect.objectContaining({ page: 0, sort: 'name,asc' })))
  })

  it('keeps pagination accessible when current-page filters find no matches', async () => {
    assetService.getAssets.mockResolvedValue({ content: [item], totalElements: 25 })
    render(page())
    await screen.findAllByText(item.name)
    fireEvent.change(screen.getByLabelText(t.assets.searchPlaceholder), { target: { value: 'missing' } })
    expect(screen.getByText(t.assets.noMatchTitle)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.assets.pagination.next })).toBeEnabled()
  })

  it('clears secret inputs on successful save and reopening', async () => {
    vi.spyOn(assetService, 'createAsset').mockResolvedValue(item)
    render(page())
    await screen.findAllByText(item.name)
    openForm(); fillForm()
    fireEvent.click(screen.getByRole('button', { name: t.assets.addModal.submitBtn }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(assetService.createAsset).toHaveBeenCalledWith(vaultId, expect.objectContaining({ payload: '  PRIVATE SECRET  ' }), expect.any(Object))
    await screen.findAllByText(item.name)
    openForm()
    expect(screen.getByLabelText(/^Nội dung bí mật/)).toHaveValue('')
    expect(screen.getByLabelText(/Tên tài sản/)).toHaveValue('')
  })

  it('retains inputs on save failure and updates validation text when language changes', async () => {
    vi.spyOn(assetService, 'createAsset').mockRejectedValue({ code: 'VAULT_NOT_EDITABLE' })
    const view = render(page())
    await screen.findAllByText(item.name)
    openForm()
    fireEvent.click(screen.getByRole('button', { name: t.assets.addModal.submitBtn }))
    expect(screen.getByText(t.assets.validation.nameRequired)).toBeInTheDocument()
    view.rerender(page({ t: translations.en, lang: 'en' }))
    expect(screen.getByText(translations.en.assets.validation.nameRequired)).toBeInTheDocument()
    view.rerender(page())
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: t.assets.addModal.submitBtn }))
    await screen.findByText(t.assets.alerts.VAULT_NOT_EDITABLE)
    expect(screen.getByLabelText(/^Nội dung bí mật/)).toHaveValue('  PRIVATE SECRET  ')
  })

  it('blocks close and duplicate submit while saving', async () => {
    let resolveSave
    const save = vi.spyOn(assetService, 'createAsset').mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
    render(page())
    await screen.findAllByText(item.name)
    openForm(); fillForm()
    const submit = screen.getByRole('button', { name: t.assets.addModal.submitBtn })
    fireEvent.click(submit); fireEvent.click(submit)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog').parentElement)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(save).toHaveBeenCalledOnce()
    resolveSave(item)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('traps keyboard focus, closes with Escape and restores the opener', async () => {
    render(page())
    await screen.findAllByText(item.name)
    const opener = screen.getAllByRole('button', { name: t.assets.addNewBtn })[0]
    opener.focus(); openForm()
    expect(screen.getByLabelText(/Tên tài sản/)).toHaveFocus()
    const last = screen.getByRole('button', { name: t.assets.addModal.submitBtn })
    last.focus(); fireEvent.keyDown(window, { key: 'Tab' })
    expect(screen.getByRole('button', { name: t.assets.closeBtn })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
