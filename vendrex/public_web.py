"""Bounded public HTTPS retrieval. Source content is never interpreted as commands."""
from __future__ import annotations
from html.parser import HTMLParser
import hashlib
import ipaddress
import socket
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from .db import now


def validate_url(url):
    parsed=urlparse(url)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443):
        raise ValueError('Somente páginas HTTPS públicas, sem credenciais ou portas adicionais.')
    if parsed.hostname.lower() in {'localhost','metadata.google.internal'} or parsed.hostname.endswith(('.local','.internal')):
        raise ValueError('Endereço privado bloqueado.')
    try:
        addresses=socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
    except socket.gaierror:
        # Managed HTTP proxies can resolve names remotely. Literal addresses are still checked below.
        addresses=[]
    try: literal=ipaddress.ip_address(parsed.hostname)
    except ValueError: literal=None
    ips=[ipaddress.ip_address(item[4][0]) for item in addresses]+([literal] if literal else [])
    if any(not ip.is_global for ip in ips): raise ValueError('Rede privada bloqueada.')
    return parsed


class PublicRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        validate_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)


class PageText(HTMLParser):
    def __init__(self):
        super().__init__();self.parts=[];self.links=[];self.skip=0;self.title=False;self.titles=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag in {'script','style','noscript'}: self.skip+=1
        if tag=='title': self.title=True
        if tag=='a' and attrs.get('href'): self.links.append(attrs['href'])
    def handle_endtag(self,tag):
        if tag in {'script','style','noscript'}: self.skip=max(0,self.skip-1)
        if tag=='title': self.title=False
    def handle_data(self,text):
        if not self.skip and text.strip():
            self.parts.append(text.strip())
            if self.title: self.titles.append(text.strip())


def fetch_public(url, timeout=25):
    validate_url(url)
    opener=build_opener(ProxyHandler(),PublicRedirect())
    request=Request(url,headers={'User-Agent':'VendrexResearch/2.2 (public business research; no messaging)','Accept':'text/html,application/xhtml+xml,text/plain'})
    with opener.open(request,timeout=timeout) as response:
        final=response.geturl();validate_url(final)
        raw=response.read(2_000_001)
        if len(raw)>2_000_000: raise ValueError('Página excede 2 MB; leitura cancelada.')
        kind=response.headers.get('Content-Type','')
        if not any(t in kind for t in ('text/html','text/plain','application/xhtml')): raise ValueError('Tipo de página não suportado.')
        charset=response.headers.get_content_charset() or 'utf-8'
        html=raw.decode(charset,errors='replace')
    parser=PageText();parser.feed(html)
    return {'url':url,'final_url':final,'http_status':200,'retrieved_at':now(),'sha256':hashlib.sha256(raw).hexdigest(),
            'title':' '.join(parser.titles),'text':' '.join(parser.parts),'links':list(dict.fromkeys(urljoin(final,x) for x in parser.links)),
            'html':html,'trust':'UNTRUSTED_EXTERNAL_DATA'}
