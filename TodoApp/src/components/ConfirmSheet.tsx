import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { Sheet, SheetActions } from './Sheet';
import { Button } from './Button';
import { Text } from './Text';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Löschen',
  cancelLabel = 'Abbrechen',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <Sheet visible={visible} onClose={onCancel} title={title}>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <SheetActions>
        <Button variant="secondary" onPress={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onPress={onConfirm}>
          {confirmLabel}
        </Button>
      </SheetActions>
    </Sheet>
  );
}

interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Bestaetigungsdialoge ohne eigenen State pro Screen.
 *
 * Die Request-Form ist absichtlich identisch zum bisherigen
 * `confirmModal`-State ({ title, message, onConfirm }) -- so bleiben die
 * bestehenden Aufrufstellen bei der Migration unveraendert; es entfallen
 * nur State und Modal-JSX.
 *
 *   const { confirm, element } = useConfirm();
 *   ...
 *   confirm({ title: 'Liste löschen?', message: '...', onConfirm: () => del(id) });
 *   ...
 *   {element}
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback((r: ConfirmRequest) => setRequest(r), []);
  const cancel = useCallback(() => setRequest(null), []);
  const accept = useCallback(() => {
    const fn = request?.onConfirm;
    setRequest(null);
    fn?.();
  }, [request]);

  const element = (
    <ConfirmSheet
      visible={request !== null}
      title={request?.title ?? ''}
      message={request?.message}
      confirmLabel={request?.confirmLabel}
      destructive={request?.destructive ?? true}
      onConfirm={accept}
      onCancel={cancel}
    />
  );

  return { confirm, element };
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    message: { ...t.type.body, color: t.colors.textSub },
  });
