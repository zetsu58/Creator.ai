const $=s=>document.querySelector(s);let operation='smart_enhance',file=null;
const picker=$('#picker'),input=$('#file'),preview=$('#preview'),run=$('#run'),status=$('#status');
picker.onclick=()=>input.click();input.onchange=()=>{file=input.files?.[0]||null;if(!file)return;if(file.size>25*1024*1024){status.textContent='Dosya 25 MB sınırını aşıyor.';return}preview.src=URL.createObjectURL(file);picker.classList.add('has');run.disabled=false;status.textContent='Hazır • Orijinal dosya korunacak.'};
document.querySelectorAll('.tools button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tools button').forEach(x=>x.classList.remove('active'));b.classList.add('active');operation=b.dataset.op;status.textContent=operation==='erase'?'Silinecek alan için maske editörü kullanılacak.':'Hazır.'});
run.onclick=async()=>{if(!file)return;run.disabled=true;status.textContent='Fotoğraf hazırlanıyor…';try{
  // Existing Creator upload service should return a short-lived asset URL. This UI intentionally
  // does not inline base64 images into the job API.
  const upload=await fetch('/api/uploads/image',{method:'POST',headers:{'content-type':file.type,'x-file-name':encodeURIComponent(file.name)},body:file});
  if(!upload.ok)throw new Error('Yükleme başarısız');const asset=await upload.json();
  const body={userId:localStorage.getItem('creator_user_id')||'private-owner',assetUrl:asset.url,operation,preset:$('#preset').value,strength:Number($('#strength').value)/100,preserveFace:$('#face').checked,stripMetadata:true};
  if(operation==='erase')throw new Error('Silme modu için maske çizim ekranı henüz tamamlanmalı.');
  const r=await fetch('/v1/photo-lab/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error('İş başlatılamadı');const job=await r.json();status.textContent=`İş sıraya alındı • ${job.id.slice(0,8)}`;
}catch(e){status.textContent=e.message||'Bir hata oluştu'}finally{run.disabled=false}};
