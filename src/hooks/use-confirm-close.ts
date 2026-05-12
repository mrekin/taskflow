'use client';

import { useState, useCallback } from 'react';

interface UseConfirmCloseOptions {
  isDirty: boolean;
  onClose: () => void;
}

export function useConfirmClose({ isDirty, onClose }: UseConfirmCloseOptions) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && isDirty) {
      setShowConfirm(true);
      return;
    }
    if (!open) {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleConfirmDiscard = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  const handleCancelDiscard = useCallback(() => {
    setShowConfirm(false);
  }, []);

  return {
    handleOpenChange,
    showConfirm,
    handleConfirmDiscard,
    handleCancelDiscard,
  };
}
