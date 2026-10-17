import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ModalContext } from "./ModalContext";

export type ModalOptions = {
  title?: ReactNode;
  content: ReactNode;
  closeStyle?: "icon" | "button" | "none";
  closeText?: string;
  maxWidth?: string;
  fitContent?: boolean;
};

export type ModalContextType = {
  modal: ModalOptions | null;
  openModal: (options: ModalOptions) => void;
  closeModal: () => void;
  forceCloseModal: () => void;
  registerCloseGuard: (guard: (() => boolean) | null) => void;
};

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalOptions | null>(null);
  const guardRef = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    // The modal provider remains mounted during route/session changes.
    // Any dialog from a former user (including an unsaved payroll preview)
    // must disappear immediately on logout or account switch, regardless
    // of a dirty-form guard.
    const clearSessionModal = () => {
      guardRef.current = null;
      setModal(null);
    };
    window.addEventListener("barticket-auth", clearSessionModal);
    return () => window.removeEventListener("barticket-auth", clearSessionModal);
  }, []);


  const registerCloseGuard = useCallback((guard: (() => boolean) | null) => {
    guardRef.current = guard;
  }, []);

  const openModal = useCallback((options: ModalOptions) => {
    guardRef.current = null;
    setModal(options);
  }, []);

  const forceCloseModal = useCallback(() => {
    guardRef.current = null;
    setModal(null);
  }, []);

  const closeModal = useCallback(() => {
    if (guardRef.current && !guardRef.current()) return;
    forceCloseModal();
  }, [forceCloseModal]);

  return (
    <ModalContext.Provider value={{ modal, openModal, closeModal, forceCloseModal, registerCloseGuard }}>
      {children}
    </ModalContext.Provider>
  );
}
