from jinja2.utils import LRUCache
from backend.app.resource_budget import CacheBudget
from jinja2 import Environment, FileSystemLoader, PrefixLoader, DictLoader, StrictUndefined, select_autoescape

from backend.app.domain.admin_presentation import admin_datetime,ADMIN_TIMEZONE_LABEL

from backend.app.domain.public_projects import project_role,project_amount,project_period

class Renderer:
    def __init__(self,loader):
        """保存构造参数和适配器，供此对象后续操作复用。"""
        self.budget=CacheBudget()
        self.env = Environment(loader=loader, autoescape=select_autoescape(['html']),
                               undefined=StrictUndefined, cache_size=self.budget.limits()[1])
        self.env.filters['admin_datetime']=admin_datetime
        self.env.filters.update(project_role=project_role,project_amount=project_amount)
        self.env.globals['project_period']=project_period
        self.env.globals['admin_timezone']=ADMIN_TIMEZONE_LABEL

    @classmethod
    def local(cls,root):
        """从本地模板目录创建共享Jinja2渲染器。"""
        return cls(PrefixLoader({area:FileSystemLoader(root/'frontend'/area/'templates')
                                for area in ('public','admin','shared')}))

    @classmethod
    def bundled(cls,templates):
        """从Worker打包的模板字典创建Jinja2渲染器。"""
        return cls(DictLoader(templates))

    def render(self,name,**context):
        """使用指定模板与上下文输出HTML。"""
        capacity=self.budget.limits()[1]
        if self.env.cache.capacity!=capacity:
            previous=self.env.cache;self.env.cache=LRUCache(capacity)
            for key,value in reversed(previous.items()[:capacity]):self.env.cache[key]=value
        return self.env.get_template(name).render(**context)
