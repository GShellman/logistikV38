(() => {
  'use strict';

  let modalBack = null;
  let modal = null;
  let modalTitle = null;
  let modalSubtitle = null;
  let modalBody = null;
  let modalClose = null;

  function initModalElements() {
    modalBack = document.getElementById('hfV2ModalBack');
    modal = document.getElementById('hfV2Modal');
    modalTitle = document.getElementById('hfV2ModalTitle');
    modalSubtitle = document.getElementById('hfV2ModalSubtitle');
    modalBody = document.getElementById('hfV2ModalBody');
    modalClose = document.getElementById('hfV2ModalClose');

    modalBack?.addEventListener('click', event => {
      if (event.target === modalBack) closeModal();
    });
    modalClose?.addEventListener('click', closeModal);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modalBack && !modalBack.hidden) closeModal();
    });
  }

  function setModalBody(html) {
    if (!modalBody) initModalElements();
    if (modalBody) modalBody.innerHTML = html || '';
  }

  function openModal({className = '', title = '', subtitle = '', bodyHtml = ''} = {}) {
    if (!modalBack || !modal) initModalElements();
    if (!modalBack || !modal) return;

    modal.className = ['hf-v2-modal', 'show', className].filter(Boolean).join(' ');
    if (modalTitle) modalTitle.textContent = title;
    if (modalSubtitle) {
      modalSubtitle.textContent = subtitle;
      modalSubtitle.hidden = !subtitle;
    }
    setModalBody(bodyHtml);
    modalBack.hidden = false;
    modalClose?.focus();
  }

  function closeModal() {
    if (!modalBack) initModalElements();
    if (modalBack) modalBack.hidden = true;
    modal?.classList.remove('show');
  }

  window.HFV2Modal = {
    openModal,
    closeModal,
    setModalBody,
  };
})();
