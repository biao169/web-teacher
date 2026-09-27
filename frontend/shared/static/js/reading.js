(() => {
 const select=document.getElementById('reading-size');
 if(!select)return;
 const choices=['standard','comfortable','large'];
 try{const value=localStorage.getItem('teacher-reading');if(choices.includes(value)){select.value=value;document.documentElement.dataset.reading=value;}}catch{}
 select.addEventListener('change',()=>{document.documentElement.dataset.reading=select.value;try{localStorage.setItem('teacher-reading',select.value);}catch{}});
})();
