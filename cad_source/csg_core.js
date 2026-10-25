/*
Copyright (c) 2011 Evan Wallace (http://madebyevan.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

Original CSG.js source: https://github.com/evanw/csg.js
The compact BSP engine in csg_core.js is adapted from this implementation.
*/
/* Compact BSP solid boolean engine.
 * Adapted from CSG.js, Copyright (c) 2011 Evan Wallace, MIT License.
 * The complete license is included in the downloadable package.
 */
var CSG = (() => {
 const EPS=1e-5;
 class Vec {
  constructor(x,y,z){if(Array.isArray(x)){[x,y,z]=x;}this.x=x;this.y=y;this.z=z;}
  clone(){return new Vec(this.x,this.y,this.z)}
  negated(){return this.times(-1)} plus(b){return new Vec(this.x+b.x,this.y+b.y,this.z+b.z)}
  minus(b){return new Vec(this.x-b.x,this.y-b.y,this.z-b.z)} times(t){return new Vec(this.x*t,this.y*t,this.z*t)}
  dot(b){return this.x*b.x+this.y*b.y+this.z*b.z} cross(b){return new Vec(this.y*b.z-this.z*b.y,this.z*b.x-this.x*b.z,this.x*b.y-this.y*b.x)}
  unit(){return this.times(1/Math.sqrt(this.dot(this)))} lerp(b,t){return this.plus(b.minus(this).times(t))} arr(){return [this.x,this.y,this.z]}
 }
 class Plane {
  constructor(normal,w){this.normal=normal;this.w=w} clone(){return new Plane(this.normal.clone(),this.w)}
  flip(){this.normal=this.normal.negated();this.w=-this.w}
  split(p,cf,cb,front,back){
   let type=0,types=p.vertices.map(v=>{let t=this.normal.dot(v)-this.w;let k=t < -EPS?2:t > EPS?1:0;type|=k;return k;});
   if(type===0)(this.normal.dot(p.plane.normal)>0?cf:cb).push(p);
   else if(type===1)front.push(p);else if(type===2)back.push(p);
   else {let f=[],b=[];for(let i=0;i<p.vertices.length;i++){let j=(i+1)%p.vertices.length,ti=types[i],tj=types[j],vi=p.vertices[i],vj=p.vertices[j];if(ti!==2)f.push(vi);if(ti!==1)b.push(vi);if((ti|tj)===3){let t=(this.w-this.normal.dot(vi))/this.normal.dot(vj.minus(vi)),v=vi.lerp(vj,t);f.push(v);b.push(v);}}appendClipped(f,front);appendClipped(b,back);}
  }
 }
 // A clipping plane may produce a polygon collapsed to an edge. Discard
 // only those zero-area fragments that Poly would reject; primitives still
 // use strict construction. This preserves geometry and prevents numerical
 // failures for larger custom grids.
 function appendClipped(vertices,target){
  for(let i=1;i<vertices.length-1;i++){
   const v=vertices[i].minus(vertices[0]).cross(vertices[i+1].minus(vertices[0]));
   if(v.dot(v)>1e-18){target.push(new Poly(vertices));return;}
  }
 }
 class Poly {
  constructor(vertices){this.vertices=vertices;let n=null;for(let i=1;i<vertices.length-1;i++){let v=vertices[i].minus(vertices[0]).cross(vertices[i+1].minus(vertices[0]));if(v.dot(v)>1e-18){n=v.unit();break;}}if(!n)throw Error('Degenerate solid face');this.plane=new Plane(n,n.dot(vertices[0]));}
  clone(){return new Poly(this.vertices.map(v=>v.clone()))} flip(){this.vertices.reverse();this.plane.flip()}
 }
 class Node {
  constructor(polys=[]){this.plane=null;this.polygons=[];this.front=null;this.back=null;if(polys.length)this.build(polys)}
  invert(){for(let p of this.polygons)p.flip();if(this.plane)this.plane.flip();if(this.front)this.front.invert();if(this.back)this.back.invert();[this.front,this.back]=[this.back,this.front]}
  clipPolygons(polys){if(!this.plane)return polys.slice();let f=[],b=[];for(let p of polys)this.plane.split(p,f,b,f,b);if(this.front)f=this.front.clipPolygons(f);if(this.back)b=this.back.clipPolygons(b);else b=[];return f.concat(b)}
  clipTo(b){this.polygons=b.clipPolygons(this.polygons);if(this.front)this.front.clipTo(b);if(this.back)this.back.clipTo(b)}
  all(){return this.polygons.concat(this.front?this.front.all():[],this.back?this.back.all():[])}
  build(polys){if(!polys.length)return;if(!this.plane)this.plane=polys[0].plane.clone();let f=[],b=[];for(let p of polys)this.plane.split(p,this.polygons,this.polygons,f,b);if(f.length){if(!this.front)this.front=new Node();this.front.build(f)}if(b.length){if(!this.back)this.back=new Node();this.back.build(b)}}
 }
 class Solid {
  constructor(polys=[]){this.polygons=polys} clone(){return new Solid(this.polygons.map(p=>p.clone()))}
  union(s){if(!this.polygons.length)return s.clone();if(!s.polygons.length)return this.clone();let a=new Node(this.clone().polygons),b=new Node(s.clone().polygons);a.clipTo(b);b.clipTo(a);b.invert();b.clipTo(a);b.invert();a.build(b.all());return new Solid(a.all())}
  subtract(s){if(!this.polygons.length||!s.polygons.length)return this.clone();let a=new Node(this.clone().polygons),b=new Node(s.clone().polygons);a.invert();a.clipTo(b);b.clipTo(a);b.invert();b.clipTo(a);b.invert();a.build(b.all());a.invert();return new Solid(a.all())}
  intersect(s){if(!this.polygons.length||!s.polygons.length)return new Solid();let a=new Node(this.clone().polygons),b=new Node(s.clone().polygons);a.invert();b.clipTo(a);b.invert();a.clipTo(b);b.clipTo(a);a.build(b.all());a.invert();return new Solid(a.all())}
 }
 function mesh(v,f){return new Solid(f.map(p=>new Poly(p.map(i=>new Vec(v[i])))))}
 return {Vec,Poly,Solid,mesh};
})();
