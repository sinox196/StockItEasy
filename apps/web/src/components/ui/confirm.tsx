'use client';

import { ReactNode, useState } from 'react';
import { useI18n } from '@/providers/i18n';
import { Button } from './button';
import { Dialog } from './dialog';

/** Confirmation dialog for any action that changes data in a significant way. */
export function ConfirmButton({
  children,
  title,
  description,
  onConfirm,
  variant = 'default',
  confirmLabel,
  size,
  disabled,
}: {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  onConfirm: () => Promise<unknown> | unknown;
  variant?: 'default' | 'danger' | 'secondary' | 'outline' | 'accent' | 'ghost';
  confirmLabel?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'touch';
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} disabled={disabled}>
        {children}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={title ?? t('common.confirmTitle')}
        description={description ?? t('common.areYouSure')}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={variant === 'danger' ? 'danger' : 'default'}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel ?? t('common.confirm')}
            </Button>
          </>
        }
      />
    </>
  );
}
