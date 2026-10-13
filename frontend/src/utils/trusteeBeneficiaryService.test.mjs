import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VAULT_ID,
  getTrustees,
  createTrustee,
  getBeneficiaries,
  createBeneficiary,
  checkConfigurationReadiness,
} from './trusteeBeneficiaryService.js';

test('getTrustees - filters status strictly by APPOINTED and ignores ACTIVE or REVOKED', async () => {
  const mockFetcher = async () => ({
    ok: true,
    status: 200,
    json: async () => [
      { id: '1', fullName: 'Trustee 1', status: 'APPOINTED' },
      { id: '2', fullName: 'Trustee 2', status: 'ACTIVE' }, // DB status, must NOT be returned
      { id: '3', fullName: 'Trustee 3', status: 'REVOKED' },
    ],
  });

  const list = await getTrustees(DEFAULT_VAULT_ID, { fetchFn: mockFetcher });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, '1');
  assert.equal(list[0].status, 'APPOINTED');
});

test('createTrustee - handles 409 conflict and throws TRUSTEE_ALREADY_EXISTS', async () => {
  const mockFetcher = async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      code: 'TRUSTEE_ALREADY_EXISTS',
      message: 'Mỗi két chỉ có tối đa 1 Người giám hộ hiện tại.',
    }),
  });

  await assert.rejects(
    async () => {
      await createTrustee(DEFAULT_VAULT_ID, { fullName: 'Nguyễn Văn A', phone: '0901234567' }, { fetchFn: mockFetcher });
    },
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'TRUSTEE_ALREADY_EXISTS');
      assert.notEqual(err.code, 'TRUSTEE_LIMIT_EXCEEDED');
      return true;
    }
  );
});

test('createTrustee - preserves 409 VAULT_NOT_EDITABLE and does not map to duplicate trustee', async () => {
  const mockFetcher = async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      code: 'VAULT_NOT_EDITABLE',
      message: 'Két đang ở trạng thái khóa không thể chỉnh sửa.',
    }),
  });

  await assert.rejects(
    async () => {
      await createTrustee(DEFAULT_VAULT_ID, { fullName: 'Nguyễn Văn A', phone: '0901234567' }, { fetchFn: mockFetcher });
    },
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'VAULT_NOT_EDITABLE');
      assert.notEqual(err.code, 'TRUSTEE_ALREADY_EXISTS');
      assert.equal(err.message, 'Két đang ở trạng thái khóa không thể chỉnh sửa.');
      return true;
    }
  );
});

test('createTrustee - creates trustee successfully returning APPOINTED', async () => {
  const mockFetcher = async (url, opts) => {
    assert.equal(opts.method, 'POST');
    const body = JSON.parse(opts.body);
    assert.equal(body.fullName, 'Nguyễn Văn A');
    assert.equal(body.phone, '0901234567');
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: 't-123',
        vaultId: DEFAULT_VAULT_ID,
        fullName: body.fullName,
        phone: body.phone,
        status: 'APPOINTED',
      }),
    };
  };

  const res = await createTrustee(DEFAULT_VAULT_ID, { fullName: 'Nguyễn Văn A', phone: '0901234567' }, { fetchFn: mockFetcher });
  assert.equal(res.status, 'APPOINTED');
  assert.equal(res.fullName, 'Nguyễn Văn A');
});

test('createBeneficiary - creates beneficiary without userId or share percentage', async () => {
  const mockFetcher = async (url, opts) => {
    assert.equal(opts.method, 'POST');
    const body = JSON.parse(opts.body);
    assert.equal(body.fullName, 'Trần Thị B');
    assert.equal(body.userId, undefined);
    assert.equal(body.sharePercentage, undefined);
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: 'b-456',
        vaultId: DEFAULT_VAULT_ID,
        fullName: body.fullName,
      }),
    };
  };

  const res = await createBeneficiary(DEFAULT_VAULT_ID, { fullName: 'Trần Thị B' }, { fetchFn: mockFetcher });
  assert.equal(res.id, 'b-456');
  assert.equal(res.fullName, 'Trần Thị B');
});

test('checkConfigurationReadiness - requires at least 1 beneficiary, trustee is optional', async () => {
  // Scenario 1: 0 beneficiaries -> not ready
  const mockFetcherNoBen = async (url) => {
    if (url.includes('beneficiaries')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (url.includes('trustees')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    return { ok: false, status: 404 };
  };

  const status1 = await checkConfigurationReadiness(DEFAULT_VAULT_ID, { fetchFn: mockFetcherNoBen });
  assert.equal(status1.isReady, false);
  assert.equal(status1.beneficiaryCount, 0);
  assert.equal(status1.hasTrustee, false);

  // Scenario 2: 1 beneficiary, 0 trustees -> READY (trustee is optional)
  const mockFetcher1Ben = async (url) => {
    if (url.includes('beneficiaries')) {
      return { ok: true, status: 200, json: async () => [{ id: 'b-1', fullName: 'Beneficiary 1' }] };
    }
    if (url.includes('trustees')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    return { ok: false, status: 404 };
  };

  const status2 = await checkConfigurationReadiness(DEFAULT_VAULT_ID, { fetchFn: mockFetcher1Ben });
  assert.equal(status2.isReady, true);
  assert.equal(status2.beneficiaryCount, 1);
  assert.equal(status2.hasTrustee, false);

  // Scenario 3: 1 beneficiary, 1 trustee (APPOINTED) -> READY
  const mockFetcherBoth = async (url) => {
    if (url.includes('beneficiaries')) {
      return { ok: true, status: 200, json: async () => [{ id: 'b-1', fullName: 'Beneficiary 1' }] };
    }
    if (url.includes('trustees')) {
      return { ok: true, status: 200, json: async () => [{ id: 't-1', fullName: 'Trustee 1', status: 'APPOINTED' }] };
    }
    return { ok: false, status: 404 };
  };

  const status3 = await checkConfigurationReadiness(DEFAULT_VAULT_ID, { fetchFn: mockFetcherBoth });
  assert.equal(status3.isReady, true);
  assert.equal(status3.beneficiaryCount, 1);
  assert.equal(status3.hasTrustee, true);
});
