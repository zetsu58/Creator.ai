export class CompareSlider {
  constructor(root, before, after) {
    this.root=root; this.before=before; this.after=after; this.value=50;
    root.innerHTML='<div class="cmp"><img class="cmp-before"><div class="cmp-after-wrap"><img class="cmp-after"></div><input class="cmp-range" aria-label="Önce ve sonra karşılaştır" type="range" min="0" max="100" value="50"></div>';
    this.a=root.querySelector('.cmp-before'); this.b=root.querySelector('.cmp-after'); this.wrap=root.querySelector('.cmp-after-wrap'); this.range=root.querySelector('.cmp-range');
    this.setImages(before,after); this.range.addEventListener('input',()=>this.set(Number(this.range.value))); this.set(50);
  }
  setImages(before,after){this.a.src=before;this.b.src=after}
  set(v){this.value=Math.max(0,Math.min(100,v));this.wrap.style.clipPath=`inset(0 0 0 ${this.value}%)`}
}
