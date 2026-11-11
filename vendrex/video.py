"""Real, reproducible motion-graphics video. No stock footage or paid media API."""
from __future__ import annotations
from array import array
import json
import math
from pathlib import Path
import shutil
import subprocess
import wave


def font_path(bold=False):
    names=[Path('/usr/share/fonts/truetype/dejavu')/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'),Path('C:/Windows/Fonts')/('arialbd.ttf' if bold else 'arial.ttf')]
    return next((str(p) for p in names if p.is_file()),None)


def render_video32(workspace,title,trained=True):
    from PIL import Image,ImageDraw,ImageFont
    ffmpeg,ffprobe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    if not ffmpeg or not ffprobe: raise ValueError('Instale FFmpeg e ffprobe para executar a missão de vídeo.')
    width,height=1080,1920
    scenes=[('ENCONTRE A DOR',title,'Vamos olhar para sua operação.'),
            ('INVESTIGUE O IMPACTO','QUANDO O PEDIDO\nSE PERDE NO CHAT…','O retrabalho pode aparecer.\nO diagnóstico vem primeiro.'),
            ('RECONHEÇA A NECESSIDADE','MENOS CONFUSÃO.\nMAIS CLAREZA.','O que sua equipe precisa\npara atender melhor?'),
            ('MOSTRE A SOLUÇÃO','PEDIDOS, MENU\nE ATENDIMENTO.','Um fluxo pensado\npara o seu negócio.'),
            ('PERSONALIZAÇÃO','SEU NEGÓCIO.\nSEU JEITO.','Sites, sistemas de pedidos\ne integrações sob medida.'),
            ('POR QUE VENDREX','DO DIAGNÓSTICO\nÀ ENTREGA.','Escopo aprovado,\ndesenvolvimento e testes.'),
            ('TRANSPARÊNCIA','CUSTOS CLAROS.\nESCOPO DEFINIDO.','Domínio, hospedagem e terceiros\nsão avaliados separadamente.'),
            ('PRÓXIMO PASSO','VAMOS ENTENDER\nSUA OPERAÇÃO?','Converse com a Vendrex.\nComece pelo diagnóstico.')]
    frame_dir=workspace/'frames';frame_dir.mkdir(exist_ok=True)
    font_big=ImageFont.truetype(font_path(True),84) if font_path(True) else ImageFont.load_default()
    font_small=ImageFont.truetype(font_path(),29) if font_path() else ImageFont.load_default()
    caption_size=64 if trained else 36
    font_caption=ImageFont.truetype(font_path(),caption_size) if font_path() else ImageFont.load_default()
    def wrap(text,font,max_width):
        result=[]
        for paragraph in text.split('\n'):
            line=''
            for word in paragraph.split():
                test=(line+' '+word).strip()
                if font.getlength(test)>max_width and line: result.append(line);line=word
                else: line=test
            result.append(line)
        return '\n'.join(result)
    captions=[];segments=[]
    for index,(pillar,headline,caption) in enumerate(scenes):
        image=Image.new('RGB',(width,height),'#101722');draw=ImageDraw.Draw(image)
        draw.ellipse((520,-330,1600,700),fill='#1a4639')
        draw.rounded_rectangle((70,76,152,158),22,fill='#a5e6bd');draw.text((89,84),'V',font=ImageFont.truetype(font_path(True),55),fill='#183328')
        draw.text((178,100),'VENDREX',font=ImageFont.truetype(font_path(True),39),fill='#eaf2ed')
        draw.text((74,270),f'{index+1:02d} / 08   ·   {pillar}',font=font_small,fill='#a5e6bd')
        draw.multiline_text((72,475),wrap(headline.upper(),font_big,920),font=font_big,fill='#f5f7f6',spacing=22)
        # Decorative interface cards are original vector art, not invented customer screenshots.
        draw.rounded_rectangle((74,940,1006,1240),28,fill='#202e3b',outline='#405448',width=2)
        draw.text((116,984),'VENDREX / SOLUÇÕES DIGITAIS',font=font_small,fill='#a5e6bd')
        for row in range(3):
            y=1054+row*49
            draw.ellipse((116,y,132,y+16),fill='#a5e6bd')
            draw.rounded_rectangle((156,y,760-row*90,y+15),6,fill='#566b74')
        draw.text((116,1190),'ILUSTRAÇÃO CONCEITUAL',font=ImageFont.truetype(font_path(),20),fill='#9eafba')
        if trained: draw.rounded_rectangle((60,1375,1020,1750),25,fill='#080c12')
        caption_text=wrap(caption,font_caption,880)
        draw.multiline_text((95,1450),caption_text,font=font_caption,fill='#ffffff' if trained else '#afbfc6',spacing=18)
        for j in range(8):draw.rounded_rectangle((75+j*119,1820,175+j*119,1827),3,fill='#a5e6bd' if j<=index else '#344650')
        draw.text((74,1860),'CRIAÇÃO ORIGINAL · VENDREX GROWTH',font=ImageFont.truetype(font_path(),20),fill='#829aa7')
        frame=frame_dir/f'scene-{index:02d}.png';image.save(frame)
        segment=workspace/f'.segment-{index:02d}.mp4'
        command=[ffmpeg,'-y','-hide_banner','-loglevel','error','-loop','1','-framerate','30','-i',str(frame),'-t','4','-vf','zoompan=z=1+0.00015*on:x=iw/2-iw/zoom/2:y=ih/2-ih/zoom/2:d=1:s=1080x1920:fps=30','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-threads','2',str(segment)]
        run=subprocess.run(command,capture_output=True,text=True,timeout=100)
        if run.returncode: raise RuntimeError('Render FFmpeg falhou: '+run.stderr[-1000:])
        segments.append(segment)
        captions.append((index*4,(index+1)*4,caption.replace('\n',' ')))
    # Original synthesized instrumental bed: no third-party song, no claim of human narration.
    audio=workspace/'trilha-original.wav';rate=48000;samples=array('h')
    notes=[130.8128,164.8138,195.9977,146.8324,174.6141,220.0,164.8138,195.9977]
    for i in range(rate*32):
        t=i/rate;frequency=notes[min(7,int(t)//4)];beat=t%0.5
        envelope=min(1,t/1.5,(32-t)/2)*(.55+.45*math.exp(-8*beat))
        value=(math.sin(2*math.pi*frequency*t)+.35*math.sin(2*math.pi*frequency*2*t)+.2*math.sin(2*math.pi*frequency*1.5*t))*.085*envelope
        sample=max(-32767,min(32767,int(value*32767)))
        samples.extend((sample,sample))
    with wave.open(str(audio),'wb') as stream:stream.setnchannels(2);stream.setsampwidth(2);stream.setframerate(rate);stream.writeframes(samples.tobytes())
    srt=workspace/'legendas.srt'
    def stamp(seconds):return f'00:00:{seconds:02d},000'
    srt.write_text('\n\n'.join(f'{i+1}\n{stamp(start)} --> {stamp(end)}\n[Música instrumental original] {body}' for i,(start,end,body) in enumerate(captions))+'\n',encoding='utf-8')
    listing=workspace/'.segments.txt';listing.write_text('\n'.join("file '"+segment.name+"'" for segment in segments),encoding='utf-8')
    output=workspace/'vendrex-32s.mp4'
    command=[ffmpeg,'-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(listing),'-i',str(audio)]
    if trained:command+=['-i',str(srt)]
    command+=['-map','0:v','-map','1:a']
    if trained:command+=['-map','2:s','-c:s','mov_text','-metadata:s:s:0','language=por']
    command+=['-c:v','copy','-c:a','aac','-b:a','128k','-t','32','-movflags','+faststart',str(output)]
    run=subprocess.run(command,capture_output=True,text=True,timeout=60)
    if run.returncode:raise RuntimeError('Mux final falhou: '+run.stderr[-800:])
    probe=subprocess.run([ffprobe,'-v','error','-show_format','-show_streams','-of','json',str(output)],capture_output=True,text=True,timeout=20,check=True)
    metadata=json.loads(probe.stdout)
    video=next(s for s in metadata['streams'] if s['codec_type']=='video')
    duration=float(metadata['format']['duration'])
    if abs(duration-32)>.05 or (video['width'],video['height'])!=(1080,1920):raise RuntimeError('Arquivo não corresponde a MP4 vertical de 32s.')
    quality={'caption_track':any(s['codec_type']=='subtitle' for s in metadata['streams']),'caption_font_px':caption_size,'contrast':'white_on_080c12' if trained else 'light_on_101722','caption_coverage_seconds':32,'cta_seconds':4,'audio_type':'Original synthesized instrumental, no speech','scenes':8,'third_party_assets':False}
    (workspace/'ffprobe.json').write_text(probe.stdout,encoding='utf-8')
    (workspace/'roteiro.json').write_text(json.dumps({'scenes':scenes,'duration_seconds':32,'four_pillars':'config/VENDREX_COMPANY_CONTEXT.json','narration':False,'music':'Original synthesized instrumental','quality':quality},ensure_ascii=False,indent=2),encoding='utf-8')
    for segment in segments:segment.unlink()
    listing.unlink()
    return {'file':'vendrex-32s.mp4','duration_seconds':duration,'width':video['width'],'height':video['height'],'codec':video['codec_name'],'quality':quality}
