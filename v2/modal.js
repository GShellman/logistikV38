(() => {
  'use strict';

  let modalBack = null;
  let modal = null;
  let modalTitle = null;
  let modalSubtitle = null;
  let modalBody = null;
  let modalClose = null;
  let modalHeader = null;
  let dragState = null;

  function initModalElements() {
    modalBack = document.getElementById('hfV2ModalBack');
    modal = document.getElementById('hfV2Modal');
    modalTitle = document.getElementById('hfV2ModalTitle');
    modalSubtitle = document.getElementById('hfV2ModalSubtitle');
    modalBody = document.getElementById('hfV2ModalBody');
    modalClose = document.getElementById('hfV2ModalClose');
    modalHeader = modal?.querySelector?.('.hf-v2-modal-header');

    modalBack?.addEventListener('click', event => {
      if (event.target === modalBack) closeModal();
    });
    modalClose?.addEventListener('click', closeModal);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modalBack && !modalBack.hidden) closeModal();
    });

    modalHeader?.addEventListener('pointerdown', startModalDrag);
    modalHeader?.addEventListener('keydown', moveModalWithKeyboard);
    document.addEventListener('pointermove', moveModalDrag);
    document.addEventListener('pointerup', stopModalDrag);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  }

  function placeModal(left, top) {
    if (!modal) return;
    const margin = 8;
    modal.style.left = `${clamp(left, margin, window.innerWidth - modal.offsetWidth - margin)}px`;
    modal.style.top = `${clamp(top, margin, window.innerHeight - modal.offsetHeight - margin)}px`;
  }

  function startModalDrag(event) {
    if (!modal?.classList.contains('is-movable') || event.button !== 0 || event.target.closest?.('button, a, input, select, textarea')) return;
    const bounds = modal.getBoundingClientRect();
    dragState = {pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top};
    modalHeader.setPointerCapture?.(event.pointerId);
    modal.classList.add('is-moving');
    event.preventDefault();
  }

  function moveModalDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    placeModal(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
  }

  function stopModalDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    modalHeader?.releasePointerCapture?.(event.pointerId);
    modal?.classList.remove('is-moving');
    dragState = null;
  }

  function moveModalWithKeyboard(event) {
    if (!modal?.classList.contains('is-movable') || !event.key.startsWith('Arrow')) return;
    const bounds = modal.getBoundingClientRect();
    const step = event.shiftKey ? 40 : 12;
    const horizontal = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const vertical = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    placeModal(bounds.left + horizontal, bounds.top + vertical);
    event.preventDefault();
  }

  function setModalBody(html) {
    if (!modalBody) initModalElements();
    if (modalBody) modalBody.innerHTML = html || '';
  }

  function openModal({className = '', title = '', subtitle = '', bodyHtml = '', movable = false, modeless = false} = {}) {
    if (!modalBack || !modal) initModalElements();
    if (!modalBack || !modal) return;

    modal.className = ['hf-v2-modal', 'show', className, movable ? 'is-movable' : ''].filter(Boolean).join(' ');
    modalBack.classList.toggle('is-modeless', modeless);
    modal.setAttribute('aria-modal', modeless ? 'false' : 'true');
    modal.style.left = '';
    modal.style.top = '';
    if (modalHeader) {
      modalHeader.tabIndex = movable ? 0 : -1;
      modalHeader.setAttribute('aria-label', movable ? 'Fenster verschieben; Pfeiltasten verwenden oder ziehen' : '');
    }
    if (modalTitle) modalTitle.textContent = title;
    if (modalSubtitle) {
      modalSubtitle.textContent = subtitle;
      modalSubtitle.hidden = !subtitle;
    }
    setModalBody(bodyHtml);
    modalBack.hidden = false;
    if (movable) {
      const bounds = modal.getBoundingClientRect();
      placeModal(bounds.left, bounds.top);
    }
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
