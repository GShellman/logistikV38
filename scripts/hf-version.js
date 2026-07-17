(function initHfVersion(global){
  'use strict';

  const BUILD_VERSION = '1.1.38';

  global.HF_BUILD_VERSION = BUILD_VERSION;
  global.HF_BUILD_LABEL = `HF ${BUILD_VERSION} · Versorgungslogistik`;
  global.hfCurrentBuildVersion = function hfCurrentBuildVersion(){
    return global.HF_BUILD_VERSION || BUILD_VERSION;
  };
  global.hfCurrentBuildLabel = function hfCurrentBuildLabel(){
    return global.HF_BUILD_LABEL || `HF ${global.hfCurrentBuildVersion()} · Versorgungslogistik`;
  };
})(window);
