export class MaskEditor{
 constructor(canvas,img){this.c=canvas;this.ctx=canvas.getContext('2d');this.img=img;this.painting=false;this.size=42;this.undo=[];this.bind()}
 resize(){this.c.width=this.img.naturalWidth;this.c.height=this.img.naturalHeight}
 point(e){const r=this.c.getBoundingClientRect(),p=e.touches?.[0]||e;return{x:(p.clientX-r.left)*this.c.width/r.width,y:(p.clientY-r.top)*this.c.height/r.height}}
 bind(){const start=e=>{e.preventDefault();this.undo.push(this.ctx.getImageData(0,0,this.c.width,this.c.height));if(this.undo.length>15)this.undo.shift();this.painting=true;this.draw(e)};const move=e=>{if(this.painting){e.preventDefault();this.draw(e)}};const end=()=>this.painting=false;['pointerdown'].forEach(x=>this.c.addEventListener(x,start));this.c.addEventListener('pointermove',move);window.addEventListener('pointerup',end)}
 draw(e){const p=this.point(e);this.ctx.fillStyle='#fff';this.ctx.beginPath();this.ctx.arc(p.x,p.y,this.size*this.c.width/Math.max(1,this.c.clientWidth),0,Math.PI*2);this.ctx.fill()}
 clear(){this.ctx.clearRect(0,0,this.c.width,this.c.height)}
 back(){const x=this.undo.pop();if(x)this.ctx.putImageData(x,0,0)}
 setBrush(px){this.size=Math.max(8,Math.min(120,px))}
 async blob(){return await new Promise(r=>this.c.toBlob(r,'image/png'))}
}
