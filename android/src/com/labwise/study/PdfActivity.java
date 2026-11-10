package com.labwise.study;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native, offline, paginated PDF reader. Only bundled document IDs are accepted. */
public final class PdfActivity extends Activity {
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  // Renderer and descriptor are opened, used and closed exclusively on worker.
  private PdfRenderer renderer;
  private ParcelFileDescriptor descriptor;
  private ImageView image;
  private TextView pageLabel;
  private ScrollView vertical;
  private HorizontalScrollView horizontal;
  private Button previous,next,zoomOut,zoomIn,jump;
  private int page=0,pageCount=0,viewportWidth=0;
  private String documentId,title;
  private float zoom=1f;
  private Bitmap displayed;
  private volatile boolean closed=false;
  private volatile int renderTicket=0;
  private boolean busy=true;
  private ScaleGestureDetector scaler;

  static String assetFor(String id){
    if("textbook".equals(id))return "docs/textbook.pdf";
    if("boc1".equals(id))return "docs/boc-1.pdf";
    if("boc2".equals(id))return "docs/boc-2.pdf";
    return null;
  }
  private static String titleFor(String id){
    if("boc1".equals(id))return "BOC · Volume 1";
    if("boc2".equals(id))return "BOC · Volume 2";
    return "Your textbook";
  }

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    documentId=state==null?getIntent().getStringExtra("documentId"):state.getString("documentId");
    // Old callers supplied only a page number.
    if(documentId==null)documentId="textbook";
    final String asset=assetFor(documentId);
    if(asset==null){finish();return;}
    title=titleFor(documentId);
    int requested=state==null?getIntent().getIntExtra("page",1):state.getInt("page",1);
    page=Math.max(1,requested)-1;
    if(state!=null)zoom=Math.max(1f,Math.min(3f,state.getFloat("zoom",1f)));
    getWindow().setStatusBarColor(Color.rgb(35,75,62));getWindow().setNavigationBarColor(Color.rgb(35,75,62));
    LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(239,241,233));
    root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
    LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);top.setPadding(dp(8),dp(4),dp(8),dp(4));top.setBackgroundColor(Color.rgb(35,75,62));
    top.addView(button("Back",()->finish()));
    TextView heading=new TextView(this);heading.setText(title);heading.setTextColor(Color.WHITE);heading.setTextSize(16);heading.setGravity(Gravity.CENTER);top.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
    jump=button("Go to",this::jumpDialog);top.addView(jump);root.addView(top);
    scaler=new ScaleGestureDetector(this,new ScaleGestureDetector.SimpleOnScaleGestureListener(){
      float pending;
      @Override public boolean onScaleBegin(ScaleGestureDetector d){pending=zoom;return !busy;}
      @Override public boolean onScale(ScaleGestureDetector d){pending=Math.max(1,Math.min(3,pending*d.getScaleFactor()));return true;}
      @Override public void onScaleEnd(ScaleGestureDetector d){setZoom(pending);}
    });
    // Observe pinch gestures before either nested scroll view can intercept them.
    vertical=new ScrollView(this){
      private boolean pinching;
      @Override public boolean dispatchTouchEvent(MotionEvent event){
        scaler.onTouchEvent(event);
        if(event.getPointerCount()>1){
          if(!pinching){MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();}
          pinching=true;return true;
        }
        if(pinching){if(event.getActionMasked()==MotionEvent.ACTION_UP||event.getActionMasked()==MotionEvent.ACTION_CANCEL)pinching=false;return true;}
        return super.dispatchTouchEvent(event);
      }
    };
    horizontal=new HorizontalScrollView(this);horizontal.setFillViewport(true);
    LinearLayout paper=new LinearLayout(this);paper.setGravity(Gravity.CENTER_HORIZONTAL);paper.setOrientation(LinearLayout.VERTICAL);
    image=new ImageView(this);image.setScaleType(ImageView.ScaleType.FIT_XY);image.setContentDescription(title+" PDF page");paper.addView(image);
    horizontal.addView(paper,new android.widget.FrameLayout.LayoutParams(-2,-2));vertical.addView(horizontal,new android.widget.FrameLayout.LayoutParams(-1,-2));root.addView(vertical,new LinearLayout.LayoutParams(-1,0,1));
    LinearLayout bottom=new LinearLayout(this);bottom.setGravity(Gravity.CENTER);bottom.setPadding(dp(4),dp(4),dp(4),dp(4));
    previous=button("‹",()->changePage(-1));previous.setContentDescription("Previous page");bottom.addView(previous,new LinearLayout.LayoutParams(0,-2,1));
    zoomOut=button("−",()->setZoom(zoom-0.25f));zoomOut.setContentDescription("Zoom out");bottom.addView(zoomOut,new LinearLayout.LayoutParams(0,-2,1));
    pageLabel=new TextView(this);pageLabel.setText("Opening…");pageLabel.setTextColor(Color.rgb(35,75,62));pageLabel.setTextSize(12);pageLabel.setGravity(Gravity.CENTER);pageLabel.setContentDescription("PDF page number");pageLabel.setOnClickListener(v->jumpDialog());bottom.addView(pageLabel,new LinearLayout.LayoutParams(0,-2,2));
    zoomIn=button("+",()->setZoom(zoom+0.25f));zoomIn.setContentDescription("Zoom in");bottom.addView(zoomIn,new LinearLayout.LayoutParams(0,-2,1));
    next=button("›",()->changePage(1));next.setContentDescription("Next page");bottom.addView(next,new LinearLayout.LayoutParams(0,-2,1));root.addView(bottom);setContentView(root);updateControls();
    vertical.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{
      int width=r-l;
      if(width>0&&width!=viewportWidth){viewportWidth=width;if(pageCount>0)drawPage(false);}
    });
    worker.execute(()->{
      File file=null;
      try{
        long revision=getPackageManager().getPackageInfo(getPackageName(),0).lastUpdateTime;
        file=new File(getCacheDir(),"reader-"+documentId+"-"+revision+".pdf");
        if(!file.isFile()||file.length()==0){
          File temp=File.createTempFile("reader-"+documentId+"-",".tmp",getCacheDir());
          try{
            try(InputStream in=getAssets().open(asset);FileOutputStream out=new FileOutputStream(temp)){byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);}
            if(!temp.renameTo(file))throw new java.io.IOException("Could not prepare PDF");
          }finally{temp.delete();}
        }
        descriptor=ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);renderer=new PdfRenderer(descriptor);
        final int count=renderer.getPageCount();
        if(count<1)throw new java.io.IOException("Empty PDF");
        ReaderCache.pruneOlderCopies(getCacheDir(),documentId,file);
        runOnUiThread(()->{if(!closed){pageCount=count;page=Math.max(0,Math.min(count-1,page));drawPage(true);}});
      }catch(Exception e){
        if(file!=null)file.delete();
        runOnUiThread(()->{if(!closed)new AlertDialog.Builder(this).setTitle("Could not open document").setMessage("Check available device storage, then reopen the reader.").setPositiveButton("Back",(d,w)->finish()).setCancelable(false).show();});
      }
    });
  }
  private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
  private Button button(String text,Runnable action){Button b=new Button(this);b.setText(text);b.setTextSize(12);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinimumHeight(dp(48));b.setOnClickListener(v->action.run());return b;}
  private void updateControls(){
    previous.setEnabled(!busy&&page>0);next.setEnabled(!busy&&page<pageCount-1);jump.setEnabled(!busy&&pageCount>0);
    zoomOut.setEnabled(!busy&&zoom>1f);zoomIn.setEnabled(!busy&&zoom<3f);
  }
  private void changePage(int delta){if(busy||pageCount==0)return;int p=Math.max(0,Math.min(pageCount-1,page+delta));if(p!=page){page=p;zoom=1;drawPage(true);}}
  private void setZoom(float value){if(busy||pageCount==0)return;float target=Math.max(1,Math.min(3,value));if(Math.abs(target-zoom)<0.01f)return;zoom=target;drawPage(false);}
  private void jumpDialog(){
    if(pageCount==0||busy)return;
    EditText edit=new EditText(this);edit.setInputType(InputType.TYPE_CLASS_NUMBER);edit.setSingleLine(true);edit.setText(String.valueOf(page+1));edit.selectAll();
    AlertDialog dialog=new AlertDialog.Builder(this).setTitle("PDF page (1–"+pageCount+")").setView(edit).setNegativeButton("Cancel",null).setPositiveButton("Go",null).create();
    dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
      try{int n=Integer.parseInt(edit.getText().toString().trim());if(n<1||n>pageCount)throw new NumberFormatException();page=n-1;zoom=1;drawPage(true);dialog.dismiss();}
      catch(NumberFormatException ignored){edit.setError("Enter a page from 1 to "+pageCount);}
    }));dialog.show();
  }
  private void drawPage(boolean resetScroll){
    if(pageCount==0||closed)return;
    final int ticket=++renderTicket,number=page;
    int available=viewportWidth>0?viewportWidth:getResources().getDisplayMetrics().widthPixels;
    final int displayWidth=Math.max(1,Math.round(Math.min(available,dp(920))*zoom));
    final float ratio=image.getWidth()>0?(float)displayWidth/image.getWidth():1f;
    final int scrollX=resetScroll?0:Math.round(horizontal.getScrollX()*ratio),scrollY=resetScroll?0:Math.round(vertical.getScrollY()*ratio);
    busy=true;updateControls();pageLabel.setText("Loading "+(number+1)+"…");
    worker.execute(()->{
      if(closed||ticket!=renderTicket)return;
      Bitmap bitmap=null;int displayHeight;
      try(PdfRenderer.Page pdf=renderer.openPage(number)){
        displayHeight=Math.max(1,Math.round(displayWidth*(float)pdf.getHeight()/pdf.getWidth()));
        // Bound allocations for large tablets and unusually tall PDF pages.
        float scale=Math.min(1f,Math.min(2800f/displayWidth,(float)Math.sqrt(6000000d/((double)displayWidth*displayHeight))));
        int w=Math.max(1,Math.round(displayWidth*scale)),h=Math.max(1,Math.round(displayHeight*scale));
        bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.WHITE);pdf.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
      }catch(Exception|OutOfMemoryError e){
        if(bitmap!=null)bitmap.recycle();
        runOnUiThread(()->{if(!closed&&ticket==renderTicket){busy=false;pageLabel.setText("Could not render page "+(number+1));updateControls();}});return;
      }
      final Bitmap ready=bitmap;final int height=displayHeight;
      runOnUiThread(()->{
        if(closed||ticket!=renderTicket){ready.recycle();return;}
        Bitmap old=displayed;displayed=ready;image.setImageBitmap(ready);image.setLayoutParams(new LinearLayout.LayoutParams(displayWidth,height));image.setContentDescription(title+" PDF page "+(number+1)+" of "+pageCount);
        if(old!=null&&!old.isRecycled())old.recycle();
        image.post(()->{if(!closed&&ticket==renderTicket){vertical.scrollTo(0,scrollY);horizontal.scrollTo(scrollX,0);}});
        getSharedPreferences("reader-position",MODE_PRIVATE).edit().putString("documentId",documentId).putInt("page",number+1).putBoolean("pending",true).apply();
        pageLabel.setText((number+1)+" / "+pageCount+" · "+Math.round(zoom*100)+"%");busy=false;updateControls();
      });
    });
  }
  @Override public void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);out.putString("documentId",documentId);out.putInt("page",page+1);out.putFloat("zoom",zoom);}
  @Override protected void onDestroy(){
    closed=true;renderTicket++;
    if(image!=null)image.setImageDrawable(null);
    if(displayed!=null&&!displayed.isRecycled())displayed.recycle();
    worker.execute(()->{try{if(renderer!=null)renderer.close();}catch(Exception ignored){}finally{try{if(descriptor!=null)descriptor.close();}catch(Exception ignored){}}});worker.shutdown();super.onDestroy();
  }
}
