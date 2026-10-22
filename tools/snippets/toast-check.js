try { var lc = document.getElementById('legalConsentModal'); if (lc && lc.remove) lc.remove(); } catch(e){}
function info(sel){
  var el = document.querySelector(sel);
  if (!el) return sel + '=缺失';
  var cs = getComputedStyle(el);
  return sel + ': role=' + el.getAttribute('role') + ' live=' + el.getAttribute('aria-live') +
         ' pos=' + cs.position + ' bottom=' + cs.bottom + ' z=' + cs.zIndex +
         ' pad=' + cs.padding + ' cls=' + el.className.split(' ')[0] +
         ' icon=' + (el.querySelector('.material-icons') || {}).textContent;
}
showErrorMessage('测试错误');
showErrorMessage('测试错误2');
var errCount = document.querySelectorAll('.error-message').length;
showInfoMessage('测试信息');
showSuccessMessage('测试成功');
return [info('.error-message'), '同类去重=' + errCount, info('.info-message'), info('.success-message')].join(' || ');
