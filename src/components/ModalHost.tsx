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
  <Overlay onClick={closeModal}>
    <Dialog
      onClick={(e) => e.stopPropagation()}
      $maxWidth={modal.maxWidth ?? "600px"}
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
`;

const Dialog = styled.div<{ $maxWidth: string }>`
    width: 100%;
    max-width: 100%;
    height: 100dvh;
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: var(--neutral-900);

    @media (min-width: 768px) {
        width: fit-content;
        max-width: ${({ $maxWidth }) => $maxWidth};
        max-height: 80dvh;
        border-radius: var(--space-2);
    }
`;

const Footer = styled.footer`
    background: green;
    position: absolute;
    bottom: 0;
    height: 100px;
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`

const Header = styled.header`
    z-index: 1;
    padding: var(--space-2);
    display: flex;
    justify-content: space-between;
    align-items: center;
`

const Title = styled.h4`
`

const CloseButton = styled.button`
  min-width: unset;
  padding: var(--space-0);
  background: transparent;
  border: none;
`;