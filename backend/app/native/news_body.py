"""新闻正文安全呈现；后台草稿预览与访客详情使用相同HTML和媒体组件标记。"""
from html import escape
from justhtml import JustHTML
from backend.app.domain.richtext import render_body,POLICY,MEDIA,image_geometry

async def news_html(sql,value,format,public_options=None):
    """仅装饰已收录且有效的PDF链接；不查外链，不输出对象路径或任何管理字段。"""
    html,refs=render_body(value,format)
    if not refs:return html
    rows=await sql.query("SELECT uid,mime_type FROM media_assets WHERE status='active' AND uid IN ("+','.join('?' for _ in refs)+')',tuple(refs))
    pdfs={row['uid'] for row in rows if row['mime_type']=='application/pdf'}
    doc=JustHTML(html,fragment=True,policy=POLICY)
    for image in doc.query('img'):image_geometry(image)
    for node in doc.query('a'):
        match=MEDIA.fullmatch(node.attrs.get('href',''))
        if not match or match[1] not in pdfs:continue
        title=escape((node.to_text() or 'PDF文档')[:500]);url='/media/'+match[1]
        # Generated UI is separate from the stored sanitized body. Spans also work inside paragraphs.
        markup=f'<span class="pdf-inline" data-inline-pdf data-pdf-url="{url}" role="group" aria-label="{title}"><span class="pdf-inline-tools"><strong>{title}</strong><a href="{url}" target="_blank" rel="noopener noreferrer" title="打开原始PDF文件">打开文件 ↗</a><button type="button" data-pdf-start hidden>阅读 PDF</button><button type="button" data-pdf-collapse hidden>收起</button></span><span class="pdf-inline-status" role="status">按页加载；也可打开原始文件。</span><span class="pdf-inline-pages"></span><button type="button" data-pdf-next hidden>加载下一页 ↓</button></span>'
        if public_options is not None:
            en=public_options.get('lang')=='en'
            title=escape((node.to_text() or ('PDF document' if en else 'PDF文档'))[:500])
            watermark=escape(str(public_options.get('watermark') or ''),quote=True)
            allow=public_options.get('allow_download') is True
            download=f'<a href="{url}" download target="_blank" rel="noopener noreferrer" data-pdf-download>{"Download PDF" if en else "下载 PDF"} ↧</a>' if allow else ''
            fallback=('JavaScript is required to read this PDF.' if en else '请启用 JavaScript 阅读 PDF。')
            markup=f'<span class="pdf-inline pdf-public" data-inline-pdf data-pdf-public data-pdf-lang="{"en" if en else "zh"}" data-pdf-watermark="{watermark}" data-pdf-url="{url}" role="group" aria-label="{title}" data-copy-ignore><span class="pdf-inline-tools"><strong>{title}</strong><button type="button" data-pdf-start hidden>{"View PDF" if en else "查看 PDF"}</button><button type="button" data-pdf-collapse hidden>{"Collapse" if en else "收起"}</button>{download}</span><span class="pdf-inline-status" role="status" aria-live="polite"></span><span class="pdf-inline-pages"></span><button type="button" data-pdf-next hidden>{"Next page" if en else "下一页"} ↓</button><noscript>{fallback}</noscript></span>'
        # Only this constant template bypasses the user HTML policy; text and URL above are constrained.
        replacement=JustHTML(markup,fragment=True,sanitize=False).query_one('[data-inline-pdf]')
        replacement.parent.remove_child(replacement);node.parent.replace_child(replacement,node)
    return doc.to_html(pretty=False)
