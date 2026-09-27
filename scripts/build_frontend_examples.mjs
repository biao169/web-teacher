// Reproducible fictional content; Node is needed only to rebuild this checked-in file.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generatePublicationCitations } from '../frontend/admin/static/js/publication-tools.mjs';

const version = 'frontend-130-v1';
const identity = (table, index) => createHash('sha256').update(`teacher-examples:${version}:${table}:${index}`).digest('hex').slice(0, 32);
const names = [
  ['林沐','Mu Lin'],['陈予','Yu Chen'],['周禾','He Zhou'],['李岚','Lan Li'],['王知','Zhi Wang'],
  ['赵初','Chu Zhao'],['刘宁','Ning Liu'],['黄澄','Cheng Huang'],['吴书','Shu Wu'],['徐乐','Le Xu'],
  ['孙晴','Qing Sun'],['胡遥','Yao Hu'],['朱安','An Zhu'],['高星','Xing Gao'],['何言','Yan He'],
  ['郭夏','Xia Guo'],['马辰','Chen Ma'],['罗笙','Sheng Luo'],['梁溪','Xi Liang'],['宋白','Bai Song'],
  ['郑青','Qing Zheng'],['谢然','Ran Xie'],['韩序','Xu Han'],['唐舒','Shu Tang'],['冯远','Yuan Feng'],
  ['于杉','Shan Yu'],['董可','Ke Dong'],['萧雨','Yu Xiao'],['程简','Jian Cheng'],['沈竹','Zhu Shen'],
];
const topics = ['设备状态监测','时序模式识别','可解释人工智能','多传感器融合','边缘智能','数字孪生','制造质量分析','预测性维护','信号处理','机器人感知'];
const students = names.map(([cn, en], n) => {
  const i=n+1, degree=i<=10?'博士':i<=22?'硕士':'本科', graduated=i%5===0;
  const start=graduated?2020+(i%2):2023+(i%4);
  const topic=topics[n%topics.length];
  return {uid:identity('students',i), asset:i%4?1+(i%3):null, values:{
    name:`示例学生 ${String(i).padStart(2,'0')} · ${cn}`, name_en:`Demo Student ${String(i).padStart(2,'0')} · ${en}`,
    student_id:`FRONTEND-DEMO-${String(i).padStart(3,'0')}`, degree,
    category:degree==='本科'?'本科生':`${degree}研究生`, grade:String(start),
    status:graduated?'毕业':'在读', enrollment_date:`${start}-09-01`,
    graduation_date:graduated?`${start+(degree==='硕士'?3:4)}-06-30`:null,
    direction:i%3===0?`${topic}；${topics[(n+3)%topics.length]}`:topic,
    destination:graduated?'虚构演示研究院（示例去向）':null,
    awards:i%3===0?'示例教学展示奖（虚构）；示例创新实践奖（虚构）':i%3===1?'示例课程优秀展示（虚构）':null,
    bio:'【虚构示例】仅用于前台排版、分类与复制验收。'+(i%3===0?`围绕${topic}开展演示性学习。本记录不对应真实学生、奖项或研究成果。`.repeat(9):`演示学习方向：${topic}。`),
    email:`student-${i}@example.invalid`, contact_visibility:'hidden',
    visibility:'public', is_featured:1, sort_order:2000+i,
  }};
});
const publications = Array.from({length:100},(_,n) => {
  const i=n+1, cn=i%5<2, journal=i<=70, uid=identity('publications',i);
  const count=1+(i%8), authors=Array.from({length:count},(_,a)=>names[(i+a)%names.length][cn?0:1]);
  const corresponding = i%4===0&&count>1?[authors[0],authors.at(-1)]:[authors[[0,Math.floor(count/2),count-1][i%3]]];
  const long=i%9===0;
  const venue=journal
    ? (cn?'虚构示例期刊：':'Fictional Demonstration Journal: ')+(long?'面向复杂工程系统的多源时序数据融合与可解释分析教学案例 / Long Venue Layout Review ': '系统与计算 / Systems and Computing ')+(1+i%55)
    : (cn?'虚构示例会议：':'Fictional Demonstration Conference: ')+(long?'工程教育中的跨学科智能系统、信号分析与可复现实验教学研讨会 ': 'Teaching and Research Interfaces ')+(1+i%12);
  const values={
    title:cn?`【虚构示例论文 ${String(i).padStart(3,'0')}】${topics[n%10]}的教学演示与界面验证`:`[Fictional Demo ${String(i).padStart(3,'0')}] Teaching study of ${['condition monitoring','time-series patterns','explainable models','sensor fusion','edge intelligence'][n%5]}`,
    authors:authors.join('; '), corresponding_authors:corresponding.join('; '),
    publication_type:journal?'期刊论文':'会议论文', venue, year:2020+Math.floor(n/15),
    volume:journal?String(1+n%20):null, issue:journal?String(1+n%6):null, pages:`${10*i+1}-${10*i+9}`,
    doi:null, url:null, index_type:i%3===0?'演示收录A（虚构）；演示收录B（虚构）':i%3===1?'演示收录A（虚构）':'演示收录B（虚构）',
    author_role:i%3===0?'第一作者':i%3===1?'通讯作者':'共同作者',
    display_tags:'虚构示例；前台验收', keywords:topics[n%10]+'；教学演示',
    pdf_visibility:i%10===0?'public':'hidden', visibility:'public', is_featured:1, sort_order:2000+i,
  };
  const generated=generatePublicationCitations({...values,uid},[authors[0]]);
  if(generated.warnings.length) throw new Error(generated.warnings.join('; '));
  Object.assign(values,generated.fields,{source_citation:generated.fields.citation_gbt});
  return {uid, asset:i%5===0?4:null, values};
});
const result={version,notice:'所有人物、单位、论文、收录和奖项均为虚构示例；DOI 留空，不对应真实成果。',students,publications};
const path=fileURLToPath(new URL('../backend/app/native/frontend_example_rows.json',import.meta.url));
const output=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check')) {
  if(readFileSync(path,'utf8')!==output) throw new Error('Frontend example data differs from its generator');
  console.log('Verified 30 students, 100 publications and all saved citation formats.');
} else {writeFileSync(path,output);console.log(path);}
