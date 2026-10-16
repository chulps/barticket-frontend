// src/components/ModalHost.tsx

// import react stuff
import { useEffect } from "react";
import { useModal } from "../hooks/useModal";
import { createPortal } from "react-dom";

// import npm package
import styled from "styled-components";

// import UI components
import Icon from "../components/Icon"
import { useI18n } from "../i18n";

// component
export default function ModalHost() {
    const { modal, closeModal } = useModal();
    const { t } = useI18n();

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                closeModal();
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        return () =>
            window.removeEventListener("keydown", handleKeyDown);
    }, [closeModal]);

    if (!modal) return null;

    return createPortal(
  <Overlay onClick={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
    <Dialog
      role="dialog"
      aria-modal="true"
      aria-label={typeof modal.title === "string" ? modal.title : t("addDrink")}
      onClick={(e) => e.stopPropagation()}
      $maxWidth={modal.maxWidth ?? "600px"}
      $fit={modal.fitContent === true}
    >
      {(modal.title || modal.closeStyle === "icon") && (
        <Header>
          {modal.title && (
            <Title>{modal.title}</Title>
          )}

          {modal.closeStyle !== "button" &&
            modal.closeStyle !== "none" && (
              <CloseButton onClick={closeModal}>
                <Icon name="X" />
              </CloseButton>
          )}
        </Header>
      )}

      <Content>
        {modal.content}
      </Content>

      {modal.closeStyle === "button" && (
        <Footer>
          <button onClick={closeModal}>
            {modal.closeText ?? t("close")}
          </button>
        </Footer>
      )}
    </Dialog>
  </Overlay>,
  document.body
);
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 60%);
  backdrop-filter: blur(3px) saturate(50%);

  display: flex;
  justify-content: center;
  align-items: center;

  z-index: 1000;
  overscroll-behavior: contain;
`;

const Dialog = styled.div<{ $maxWidth: string; $fit: boolean }>`
    width: 100%;
    max-width: 100%;
    height: ${({ $fit }) => ($fit ? "auto" : "100dvh")};
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: var(--neutral-900);

    ${({ $fit, $maxWidth }) =>
        $fit &&
        `
        width: min(100% - var(--space-3), ${$maxWidth});
        max-height: 90dvh;
        min-height: 0;
        border: 1px solid var(--neutral-700);
        border-radius: var(--space-2);
    `}

    @media (min-width: 768px) {
        width: ${({ $fit, $maxWidth }) =>
            $fit ? `min(100% - var(--space-3), ${$maxWidth})` : "fit-content"};
        max-width: ${({ $maxWidth }) => $maxWidth};
        max-height: 80dvh;
        border-radius: var(--space-2);
    }
`;

const Footer = styled.footer`
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    justify-content: stretch;
    padding: var(--space-2);
    padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--neutral-700);
    background: var(--neutral-900);
    button { width: 100%; }
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
`

const Header = styled.header`
    z-index: 1;
    flex-shrink: 0;
    padding: var(--space-2);
    display: flex;
    justify-content: space-between;
    align-items: center;
`

const Title = styled.h4`
    margin: 0;
    flex: 1;
    min-width: 0;
`

const CloseButton = styled.button`
  min-width: unset;
  padding: var(--space-0);
  background: transparent;
  border: none;
`;