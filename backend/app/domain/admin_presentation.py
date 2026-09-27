"""Backend-only presentation defaults; never rewrite stored timestamps or permissions."""
from datetime import datetime,timezone,timedelta
import re

# Explicit deployment default, independent of browser/server local timezone.
ADMIN_OFFSET_MINUTES=0
ADMIN_TIMEZONE_LABEL='UTC' if ADMIN_OFFSET_MINUTES==0 else 'UTC'+('+' if ADMIN_OFFSET_MINUTES>0 else '-')+f'{abs(ADMIN_OFFSET_MINUTES)//60:02}:{abs(ADMIN_OFFSET_MINUTES)%60:02}'
PAGE_SIZE_OPTIONS=(10,20,50,100)  # Contract for the next pagination implementation.

def admin_datetime(value,offset_minutes=ADMIN_OFFSET_MINUTES):
 """Display ISO timestamps or Unix seconds; preserve date-only values and reject malformed dates."""
 if value is None or value=='':return '—'
 try:
  zone=timezone(timedelta(minutes=offset_minutes))
  if isinstance(value,bool):return '—'
  if isinstance(value,(int,float)):dt=datetime.fromtimestamp(value,timezone.utc)
  elif isinstance(value,datetime):dt=value
  else:
   text=str(value).strip()
   if re.fullmatch(r'\d{4}-\d{2}-\d{2}',text):return datetime.strptime(text,'%Y-%m-%d').strftime('%Y-%m-%d')
   dt=datetime.fromisoformat(text.replace('Z','+00:00'))
  if dt.tzinfo is None:dt=dt.replace(tzinfo=timezone.utc)
  return dt.astimezone(zone).strftime('%Y-%m-%d %H:%M:%S')
 except (ValueError,TypeError,OverflowError,OSError):return '—'
