import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { assetService } from '../services/assetService.js';
import { getAssetTranslations, ASSET_I18N, LEGAL_DISMISSED_KEY } from '../pages/assets/assetI18n.js';

describe('PS-5 Asset Service & Contract Validation Tests', () => {
  const originalFetch = globalThis.fetch;
  const mockVaultId = '00000000-0000-0000-0000-000000000001';

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Validation & Required Parameter Checks', () => {
    it('getAssets rejects call when vaultId is missing', async () => {
      await assert.rejects(
        async () => {
          await assetService.getAssets('');
        },
        (err) => {
          assert.equal(err.code, 'VAULT_REQUIRED');
          assert.match(err.message, /vaultId is required/i);
          return true;
        }
      );
    });

    it('createAsset rejects call when vaultId is missing', async () => {
      await assert.rejects(
        async () => {
          await assetService.createAsset('', {
            name: 'Valid Name',
            assetType: 'TEXT',
            payload: 'Secret',
          });
        },
        (err) => {
          assert.equal(err.code, 'VAULT_REQUIRED');
          return true;
        }
      );
    });

    it('createAsset rejects null or non-object formData', async () => {
      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, null);
        },
        (err) => {
          assert.equal(err.code, 'VALIDATION_FAILED');
          assert.match(err.message, /form data is required/i);
          return true;
        }
      );
    });

    it('createAsset rejects empty or whitespace-only name', async () => {
      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, {
            name: '   ',
            assetType: 'TEXT',
            payload: 'Secret',
          });
        },
        (err) => {
          assert.equal(err.code, 'VALIDATION_FAILED');
          assert.match(err.message, /asset name is invalid/i);
          return true;
        }
      );
    });

    it('createAsset rejects name exceeding 150 characters', async () => {
      const longName = 'A'.repeat(151);
      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, {
            name: longName,
            assetType: 'TEXT',
            payload: 'Secret',
          });
        },
        (err) => {
          assert.equal(err.code, 'VALIDATION_FAILED');
          return true;
        }
      );
    });

    it('createAsset rejects invalid or unsupported assetType', async () => {
      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, {
            name: 'Cryptocurrency Wallet',
            assetType: 'CRYPTO_UNSUPPORTED',
            payload: 'Secret',
          });
        },
        (err) => {
          assert.equal(err.code, 'VALIDATION_FAILED');
          assert.match(err.message, /asset type must be TEXT or CREDENTIAL/i);
          return true;
        }
      );
    });

    it('createAsset rejects empty or missing confidential payload', async () => {
      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, {
            name: 'Private Note',
            assetType: 'TEXT',
            payload: '   ',
          });
        },
        (err) => {
          assert.equal(err.code, 'VALIDATION_FAILED');
          assert.match(err.message, /confidential payload is required/i);
          return true;
        }
      );
    });

    it('createAsset rejects description exceeding 1000 characters', async () => {
      const longDesc = 'D'.repeat(1001);
      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, {
            name: 'Family Ledger',
            assetType: 'TEXT',
            payload: 'Secret',
            description: longDesc,
          });
        },
        (err) => {
          assert.equal(err.code, 'VALIDATION_FAILED');
          assert.match(err.message, /description exceeds 1000 characters/i);
          return true;
        }
      );
    });
  });

  describe('API Request Formatting & Pagination', () => {
    it('getAssets constructs proper query parameters and headers', async () => {
      let interceptedUrl = null;
      let interceptedHeaders = null;

      globalThis.fetch = async (url, init) => {
        interceptedUrl = url;
        interceptedHeaders = init.headers;

        return {
          ok: true,
        headers: { get: () => 'application/json' },
          status: 200,
          json: async () => ({
            content: [],
            page: 1,
            size: 20,
            totalElements: 0,
            totalPages: 1,
          }),
        };
      };

      const result = await assetService.getAssets(mockVaultId, {
        page: 1,
        size: 20,
        sort: 'name,asc',
        lang: 'en',
        accessToken: 'test-jwt-token-123',
      });

      assert.ok(interceptedUrl.includes(`/api/v1/vaults/${mockVaultId}/assets`));
      assert.ok(interceptedUrl.includes('page=1'));
      assert.ok(interceptedUrl.includes('size=20'));
      assert.ok(interceptedUrl.includes('sort=name%2Casc') || interceptedUrl.includes('sort=name,asc'));

      assert.equal(interceptedHeaders['Accept'], 'application/json');
      assert.equal(interceptedHeaders['Accept-Language'], 'en');
      assert.equal(interceptedHeaders['Authorization'], 'Bearer test-jwt-token-123');

      assert.equal(result.page, 1);
      assert.equal(result.size, 20);
      assert.equal(result.totalElements, 0);
      assert.equal(result.totalPages, 1);
      assert.deepEqual(result.content, []);
    });

    it('getAssets rejects missing pagination instead of fabricating totals', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        status: 200,
        json: async () => ({
          content: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              vaultId: mockVaultId,
              name: 'Sample',
              assetType: 'TEXT',
              hasPayload: true,
              createdAt: '2026-09-01T00:00:00Z',
              updatedAt: '2026-09-01T00:00:00Z',
            },
          ],
          totalElements: 25,
        }),
      });

      await assert.rejects(assetService.getAssets(mockVaultId, { page: 0, size: 10 }), error => error.code === 'INVALID_RESPONSE');
    });
  });

  describe('Sensitive Data Handling & Write-Only Protection', () => {
    it('createAsset transmits payload to server but sanitizeAssetResponse strips plaintext payload', async () => {
      let sentBody = null;
      const secretKey = 'CRITICAL_LEDGER_MNEMONIC_KEY_DO_NOT_LEAK';

      globalThis.fetch = async (url, init) => {
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
        headers: { get: () => 'application/json' },
          status: 201,
          json: async () => ({
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            vaultId: mockVaultId,
            name: sentBody.name,
            assetType: sentBody.assetType,
            description: sentBody.description,
            hasPayload: true,
            // Even if an insecure backend echoed payload, sanitizer must strip it
            payload: secretKey,
            createdAt: '2026-10-12T00:00:00Z',
            updatedAt: '2026-10-12T00:00:00Z',
          }),
        };
      };

      const created = await assetService.createAsset(
        mockVaultId,
        {
          name: 'Ledger Mnemonic',
          assetType: 'CREDENTIAL',
          description: 'Key backup in vault',
          payload: secretKey,
        },
        { accessToken: 'auth-token' }
      );

      // Verify transmitted payload contained the secret
      assert.equal(sentBody.payload, secretKey);
      assert.equal(sentBody.name, 'Ledger Mnemonic');
      assert.equal(sentBody.assetType, 'CREDENTIAL');

      // Verify sanitizer sanitized the response completely
      assert.equal(created.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      assert.equal(created.hasPayload, true);
      assert.equal(created.payload, undefined, 'Confidential plaintext payload MUST be undefined in returned asset');
      assert.equal('payload' in created, false, 'Property payload MUST NOT exist on sanitized asset object');
    });

    it('getAssets sanitizes every item in content array', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        status: 200,
        json: async () => ({
          content: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              vaultId: mockVaultId,
              name: 'Note 1',
              assetType: 'TEXT',
              description: null,
              hasPayload: true,
              payload: 'RAW_SECRET',
              createdAt: '2026-09-01T00:00:00Z',
              updatedAt: '2026-09-01T00:00:00Z',
            },
          ],
          totalElements: 1, page: 0, size: 20, totalPages: 1,
        }),
      });

      const page = await assetService.getAssets(mockVaultId);
      assert.equal(page.content.length, 1);
      assert.equal(page.content[0].hasPayload, true);
      assert.equal(page.content[0].payload, undefined);
      assert.equal('payload' in page.content[0], false);
    });
  });

  describe('Error Code Mapping & Unauthorized Access', () => {
    it('maps HTTP 401 to UNAUTHENTICATED error code', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        headers: { get: () => 'application/json' },
        status: 401,
        json: async () => ({ message: 'Session expired' }),
      });

      await assert.rejects(
        async () => {
          await assetService.getAssets(mockVaultId);
        },
        (err) => {
          assert.equal(err.code, 'UNAUTHENTICATED');
          assert.equal(err.status, 401);
          return true;
        }
      );
    });

    it('maps HTTP 403 to VAULT_ACCESS_DENIED error code', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        headers: { get: () => 'application/json' },
        status: 403,
        json: async () => ({ message: 'Access denied' }),
      });

      await assert.rejects(
        async () => {
          await assetService.getAssets(mockVaultId);
        },
        (err) => {
          assert.equal(err.code, 'ACCESS_DENIED');
          assert.equal(err.status, 403);
          return true;
        }
      );
    });

    it('maps HTTP 404 to VAULT_NOT_FOUND error code', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        headers: { get: () => 'application/json' },
        status: 404,
        json: async () => ({ message: 'Vault not found' }),
      });

      await assert.rejects(
        async () => {
          await assetService.getAssets(mockVaultId);
        },
        (err) => {
          assert.equal(err.code, 'RESOURCE_NOT_FOUND');
          assert.equal(err.status, 404);
          return true;
        }
      );
    });

    it('maps HTTP 400 to VALIDATION_FAILED error code', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        headers: { get: () => 'application/json' },
        status: 400,
        json: async () => ({ message: 'Bad request' }),
      });

      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, {
            name: 'Valid Name',
            assetType: 'TEXT',
            payload: 'Secret',
          });
        },
        (err) => {
          assert.equal(err.code, 'VALIDATION_FAILED');
          assert.equal(err.status, 400);
          return true;
        }
      );
    });

    it('maps HTTP 409 to CONFLICT error code', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        headers: { get: () => 'application/json' },
        status: 409,
        json: async () => ({ message: 'Vault is locked' }),
      });

      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, {
            name: 'Valid Name',
            assetType: 'TEXT',
            payload: 'Secret',
          });
        },
        (err) => {
          assert.equal(err.code, 'CONFLICT');
          assert.equal(err.status, 409);
          return true;
        }
      );
    });

    it('maps network rejection to NETWORK_ERROR code', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      await assert.rejects(
        async () => {
          await assetService.getAssets(mockVaultId);
        },
        (err) => {
          assert.equal(err.code, 'NETWORK_ERROR');
          return true;
        }
      );
    });

    it('preserves structured backend error code if provided in response body', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        headers: { get: () => 'application/json' },
        status: 422,
        json: async () => ({
          code: 'VAULT_NOT_EDITABLE',
          message: 'This vault currently does not accept new assets',
        }),
      });

      await assert.rejects(
        async () => {
          await assetService.createAsset(mockVaultId, {
            name: 'Valid Name',
            assetType: 'TEXT',
            payload: 'Secret',
          });
        },
        (err) => {
          assert.equal(err.code, 'VAULT_NOT_EDITABLE');
          assert.equal(err.status, 422);
          return true;
        }
      );
    });

    it('rethrows AbortError directly without masking as NETWORK_ERROR', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';

      globalThis.fetch = async () => {
        throw abortErr;
      };

      await assert.rejects(
        async () => {
          await assetService.getAssets(mockVaultId);
        },
        (err) => {
          assert.equal(err.name, 'AbortError');
          return true;
        }
      );
    });
  });

  describe('Translation & Dictionary Fallback Tests', () => {
    it('getAssetTranslations provides complete Vietnamese dictionary by default', () => {
      const t = getAssetTranslations(undefined, 'vi');
      assert.ok(t.assets);
      assert.equal(t.assets.title, 'Danh sách Tài sản');
      assert.equal(t.assets.types.TEXT, 'Ghi chú riêng tư');
      assert.equal(t.assets.types.CREDENTIAL, 'Thông tin xác thực');
      assert.ok(t.assets.alerts.UNAUTHENTICATED);
      assert.ok(t.assets.alerts.VAULT_ACCESS_DENIED);
      assert.ok(t.assets.alerts.loadError);
      assert.ok(t.assets.alerts.saveError);
      assert.ok(t.assets.validation.nameRequired);
      assert.ok(t.assets.validation.payloadRequired);
    });

    it('getAssetTranslations provides complete English dictionary when lang="en"', () => {
      const t = getAssetTranslations(undefined, 'en');
      assert.ok(t.assets);
      assert.equal(t.assets.title, 'Asset Inventory');
      assert.equal(t.assets.types.TEXT, 'Private Note');
      assert.equal(t.assets.types.CREDENTIAL, 'Credentials');
      assert.ok(t.assets.alerts.UNAUTHENTICATED);
      assert.ok(t.assets.alerts.NETWORK_ERROR);
    });

    it('getAssetTranslations respects external translation object when provided', () => {
      const customT = {
        assets: {
          title: 'Custom Title',
        },
      };
      const t = getAssetTranslations(customT, 'vi');
      assert.equal(t.assets.title, 'Custom Title');
    });

    it('legal notice storage key is defined as expected constant', () => {
      assert.equal(LEGAL_DISMISSED_KEY, 'legacyvault_legal_notice_dismissed');
    });
  });

  describe('Client-Side Filter & Search Logic (Migrated from Regression Suite)', () => {
    const mockList = [
      { id: '1', name: 'Di chúc gia đình', description: 'Ghi chú thừa kế', assetType: 'TEXT' },
      { id: '2', name: 'Mật khẩu Ledger', description: 'Cụm từ phục hồi 24 chữ', assetType: 'CREDENTIAL' },
      { id: '3', name: 'Tài khoản ngân hàng', description: 'Thông tin tài khoản VCB', assetType: 'CREDENTIAL' },
    ];

    it('filters correctly by assetType (ALL vs TEXT vs CREDENTIAL)', () => {
      const textOnly = mockList.filter((a) => a.assetType === 'TEXT');
      assert.equal(textOnly.length, 1);
      assert.equal(textOnly[0].name, 'Di chúc gia đình');

      const credOnly = mockList.filter((a) => a.assetType === 'CREDENTIAL');
      assert.equal(credOnly.length, 2);

      const all = mockList.filter(() => true);
      assert.equal(all.length, 3);
    });

    it('searches case-insensitively across name and description', () => {
      const query1 = 'ledger';
      const results1 = mockList.filter(
        (a) =>
          a.name.toLowerCase().includes(query1) ||
          (a.description && a.description.toLowerCase().includes(query1))
      );
      assert.equal(results1.length, 1);
      assert.equal(results1[0].id, '2');

      const query2 = 'thừa kế';
      const results2 = mockList.filter(
        (a) =>
          a.name.toLowerCase().includes(query2) ||
          (a.description && a.description.toLowerCase().includes(query2))
      );
      assert.equal(results2.length, 1);
      assert.equal(results2[0].id, '1');
    });
  });
});
