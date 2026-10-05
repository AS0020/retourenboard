let renderer;
export async function showPdf(root,url){
  if(root.dataset.loading==='true')return;
  root.dataset.loading='true';root.innerHTML='<p class="muted small-text">PDF wird geladen …</p>';
  let task,pdf,renderTask,disposed=false;
  const dispose=()=>{disposed=true;renderTask?.cancel();task?.destroy();};
  root.closest('dialog')?.addEventListener('close',dispose,{once:true});
  try{
    renderer??=import('/vendor/pdfjs/pdf.min.mjs');const lib=await renderer;
    if(disposed||!root.isConnected)return;
    lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';
    task=lib.getDocument({url,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',isEvalSupported:false,enableXfa:false});
    pdf=await task.promise;if(disposed||!root.isConnected){dispose();return;}
    root.innerHTML='<div class="pdf-controls"><button class="btn secondary small" data-pdf-back aria-label="Vorherige PDF-Seite">←</button><span aria-live="polite"></span><button class="btn secondary small" data-pdf-next aria-label="Nächste PDF-Seite">→</button></div><canvas aria-label="PDF-Seitenvorschau"></canvas>';
    const canvas=root.querySelector('canvas'),back=root.querySelector('[data-pdf-back]'),next=root.querySelector('[data-pdf-next]'),label=root.querySelector('span');let number=1;
    async function draw(){
      back.disabled=true;next.disabled=true;
      const page=await pdf.getPage(number);if(disposed||!root.isConnected)return;
      const view=page.getViewport({scale:1}),width=Math.max(200,root.clientWidth),scale=Math.min(width/view.width,1.5),viewport=page.getViewport({scale});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await renderTask.promise;
      label.textContent=`Seite ${number} / ${pdf.numPages}`;back.disabled=number===1;next.disabled=number===pdf.numPages;
    }
    const error=()=>{if(!disposed)root.innerHTML='<p class="form-error">Diese PDF-Seite konnte nicht dargestellt werden. Die Datei kann weiterhin heruntergeladen werden.</p>';};
    back.onclick=()=>{number--;draw().catch(error);};next.onclick=()=>{number++;draw().catch(error);};await draw();
  }catch(error){if(!disposed&&root.isConnected)root.innerHTML='<p class="form-error">PDF-Vorschau nicht verfügbar (z. B. beschädigt oder verschlüsselt). Bitte die Datei öffnen oder herunterladen.</p>';}
}
