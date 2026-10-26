import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import { deviceEvidence, deviceLabel, listManagedDevices } from './devices-shared';

async function runEncryption(ctx: CheckContext): Promise<void> {
  const devices = await listManagedDevices(ctx);
  if (!devices) return;
  ctx.log(`Encryption: ${devices.length} devices`);

  if (devices.length === 0) {
    ctx.fail({
      title: 'No managed devices in Intune',
      description: 'Intune returned no managed devices, so device encryption cannot be confirmed.',
      resourceType: 'tenant',
      resourceId: 'tenant',
      severity: 'medium',
      remediation: 'Enroll endpoints in Intune so their encryption state is reported.',
    });
    return;
  }

  for (const d of devices) {
    const name = deviceLabel(d);
    const evidence = deviceEvidence(d);
    if (d.isEncrypted === true) {
      ctx.pass({
        title: `Encrypted: ${name}`,
        description: `${name} (${d.operatingSystem ?? 'unknown OS'}) reports storage encryption on.`,
        resourceType: 'device',
        resourceId: name,
        evidence,
      });
    } else if (d.isEncrypted === false) {
      ctx.fail({
        title: `Not encrypted: ${name}`,
        description: `${name} (${d.operatingSystem ?? 'unknown OS'}) reports storage encryption off.`,
        resourceType: 'device',
        resourceId: name,
        severity: 'high',
        remediation:
          'Turn on BitLocker (Windows), FileVault (macOS) or device encryption (iOS/Android) through an Intune configuration profile and require it in the compliance policy.',
        evidence,
      });
    } else {
      ctx.fail({
        title: `Encryption state not reported: ${name}`,
        description: `Intune has no encryption state for ${name}.`,
        resourceType: 'device',
        resourceId: name,
        severity: 'low',
        remediation:
          'Have the device sync with Intune; if the state stays empty, check it by hand.',
        evidence,
      });
    }
  }
}

/** 3.13.16[a] The confidentiality of CUI at rest is protected. */
export const intuneDeviceEncryptionCheck: IntegrationCheck = {
  id: 'intune-device-encryption',
  name: 'Managed devices encrypted (3.13.16)',
  description:
    'Reads the storage encryption state Intune holds for every managed device (BitLocker, FileVault, mobile encryption). Evidence for 3.13.16[a].',
  service: 'intune',
  taskMapping: TASK_TEMPLATES['3.13.16[a]'],
  defaultSeverity: 'high',
  run: runEncryption,
};

/** 3.1.19[b] Encryption is employed to protect CUI on mobile devices and mobile computing platforms. */
export const intuneMobileEncryptionCheck: IntegrationCheck = {
  id: 'intune-mobile-encryption',
  name: 'Mobile devices encrypted (3.1.19)',
  description:
    'Same encryption evidence, filed against 3.1.19[b]: laptops, tablets and phones managed by Intune are the mobile computing platforms in scope.',
  service: 'intune',
  taskMapping: TASK_TEMPLATES['3.1.19[b]'],
  defaultSeverity: 'high',
  run: runEncryption,
};
