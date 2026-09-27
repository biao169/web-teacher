"""媒体字段与正文节点共用类型规则；保持原生字段和数据库定义不变。"""
from .catalog import Error

IMAGE_TYPES=('image/png','image/jpeg','image/gif','image/webp')
PDF_TYPES=('application/pdf',)
VIDEO_TYPES=('video/mp4','video/webm')
ALL_TYPES=IMAGE_TYPES+PDF_TYPES+VIDEO_TYPES+('application/zip',)
EXTENSIONS={'image/png':('png',),'image/jpeg':('jpg','jpeg'),'image/gif':('gif',),'image/webp':('webp',),'application/pdf':('pdf',),'video/mp4':('mp4',),'video/webm':('webm',),'application/zip':('zip',)}
FIELD_TYPES={('profiles','avatar_key'):IMAGE_TYPES,('students','avatar_key'):IMAGE_TYPES,
    **{('site_settings',f):IMAGE_TYPES for f in ('logo_key','favicon_key','og_image_key')},
    ('news','cover_key'):IMAGE_TYPES,('publications','pdf_key'):PDF_TYPES,('patents','certificate_key'):IMAGE_TYPES+PDF_TYPES,
    ('courses','syllabus_key'):ALL_TYPES,('courses','material_key'):ALL_TYPES,('messages','attachment_key'):ALL_TYPES}
BODY_TYPES={'body_image':IMAGE_TYPES,'body_pdf':PDF_TYPES}

def types_for(table,field):
    """选择上下文只允许真实媒体外键及两种明确的正文插入用途。"""
    kinds=BODY_TYPES.get(field) if table=='news' and field in BODY_TYPES else FIELD_TYPES.get((table,field))
    if not kinds:raise Error('此字段不支持媒体选择')
    return kinds

def check_type(table,field,mime):
    """最终内容保存也核对类型，不能通过手工请求将PDF设为头像。"""
    if mime not in types_for(table,field):raise Error('媒体类型不适用于此字段')
