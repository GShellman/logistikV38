(() => {
  'use strict';

  const networkMenu = window.HFNetworkMenu || null;
  if (window.HFNetworkMenu) delete window.HFNetworkMenu;

  function openNetworkMenuForCity(cityId) {
    networkMenu?.openNetworkMenuForCity?.(cityId);
  }

  function closeModal() {
    window.HFV2Modal?.closeModal?.();
  }

  function planConnection(originId, targetId, type) {
    return window.HFNetwork?.planConnection?.(originId, targetId, type) || null;
  }

  function confirmProject() {
    const edge = window.HFNetwork?.confirmProject?.() || null;
    if (edge) closeModal();
    return edge;
  }

  window.HF_V2 = {
    openNetworkMenuForCity,
    closeModal,
    planConnection,
    confirmProject,
  };
})();
