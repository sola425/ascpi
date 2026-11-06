package com.labwise.study;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.text.InputType;
import android.view.Gravity;
import android.view.ScaleGestureDetector;
import android.view.View;
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

/** Native, offline, paginated PDF reader with zoom and page jumps. */
public final class PdfActivity extends Activity {
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private PdfRenderer renderer;
  private ParcelFileDescriptor descriptor;
  private ImageView image;
  private TextView pageLabel;
  private ScrollView vertical;
  private HorizontalScrollView horizontal;
  private Button previous,next;
  private int page=0;
  private float zoom=1f;
  private Bitmap displayed;
  private volatile boolean closed=false;
  private volatile int renderTicket=0;
  private boolean busy=true;
  private ScaleGestureDetector scaler;

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    page=(state==null?getIntent().getIntExtra("page",1):state.getInt("page",1))-1;
    getWindow().setStatusBarColor(Color.rgb(35,75,62));getWindow().setNavigationBarColor(Color.rgb(35,75,62));
    LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(239,241,233));
    root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
    LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);top.setPadding(8,8,8,8);top.setBackgroundColor(Color.rgb(35,75,62));
    Button back=button("Back",()->finish());top.addView(back);
    TextView title=new TextView(this);title.setText("Your textbook");title.setTextColor(Color.WHITE);title.setTextSize(17);title.setGravity(Gravity.CENTER);top.addView(title,new LinearLayout.LayoutParams(0,-2,1));
    top.addView(button("Go to",this::jumpDialog));root.addView(top);
    vertical=new ScrollView(this);vertical.setFillViewport(false);horizontal=new HorizontalScrollView(this);horizontal.setFillViewport(false);image=new ImageView(this);image.setAdjustViewBounds(true);image.setScaleType(ImageView.ScaleType.FIT_XY);image.setContentDescription("Textbook page");horizontal.addView(image);vertical.addView(horizontal);root.addView(vertical,new LinearLayout.LayoutParams(-1,0,1));
    LinearLayout bottom=new LinearLayout(this);bottom.setGravity(Gravity.CENTER);bottom.setPadding(4,4,4,4);
    previous=button("‹",()->changePage(-1));previous.setContentDescription("Previous page");bottom.addView(previous,new LinearLayout.LayoutParams(0,-2,1));
    bottom.addView(button("−",()->setZoom(zoom-0.25f)),new LinearLayout.LayoutParams(0,-2,1));
    pageLabel=new TextView(this);pageLabel.setText("Opening…");pageLabel.setTextColor(Color.rgb(35,75,62));pageLabel.setTextSize(12);pageLabel.setGravity(Gravity.CENTER);bottom.addView(pageLabel,new LinearLayout.LayoutParams(0,-2,2));
    bottom.addView(button("+",()->setZoom(zoom+0.25f)),new LinearLayout.LayoutParams(0,-2,1));
    next=button("›",()->changePage(1));next.setContentDescription("Next page");bottom.addView(next,new LinearLayout.LayoutParams(0,-2,1));root.addView(bottom);setContentView(root);
    scaler=new ScaleGestureDetector(this,new ScaleGestureDetector.SimpleOnScaleGestureListener(){
      float pending;
      @Override public boolean onScaleBegin(ScaleGestureDetector d){pending=zoom;return true;}
      @Override public boolean onScale(ScaleGestureDetector d){pending=Math.max(1,Math.min(3,pending*d.getScaleFactor()));return true;}
      @Override public void onScaleEnd(ScaleGestureDetector d){setZoom(pending);}
    });
    horizontal.setOnTouchListener((v,event)->{scaler.onTouchEvent(event);return scaler.isInProgress();});
    image.setOnTouchListener((v,event)->{scaler.onTouchEvent(event);return scaler.isInProgress();});
    worker.execute(()->{
      try{
        File file=new File(getCacheDir(),"textbook-v3.pdf");
        if(!file.isFile()||file.length()!=26082701L){
          File temp=new File(getCacheDir(),"textbook-copy.tmp");
          try(InputStream in=getAssets().open("docs/textbook.pdf");FileOutputStream out=new FileOutputStream(temp)){byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);}
          if(!temp.renameTo(file))throw new java.io.IOException("Could not prepare textbook");
        }
        descriptor=ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);renderer=new PdfRenderer(descriptor);
        runOnUiThread(()->{if(!closed){busy=false;page=Math.max(0,Math.min(renderer.getPageCount()-1,page));drawPage();}});
      }catch(Exception e){runOnUiThread(()->{if(!closed)new AlertDialog.Builder(this).setTitle("Could not open textbook").setMessage("Check available device storage, then reopen the reader.").setPositiveButton("Back",(d,w)->finish()).setCancelable(false).show();});}
    });
  }
  private Button button(String text,Runnable action){Button b=new Button(this);b.setText(text);b.setTextSize(12);b.setMinWidth(0);b.setMinimumWidth(0);b.setOnClickListener(v->action.run());return b;}
  private void changePage(int delta){if(busy||renderer==null)return;int p=Math.max(0,Math.min(renderer.getPageCount()-1,page+delta));if(p!=page){page=p;zoom=1;drawPage();}}
  private void setZoom(float value){if(busy||renderer==null)return;zoom=Math.max(1,Math.min(3,value));drawPage();}
  private void jumpDialog(){if(renderer==null||busy)return;EditText edit=new EditText(this);edit.setInputType(InputType.TYPE_CLASS_NUMBER);edit.setText(String.valueOf(page+1));edit.selectAll();new AlertDialog.Builder(this).setTitle("PDF page (1–"+renderer.getPageCount()+")").setView(edit).setNegativeButton("Cancel",null).setPositiveButton("Go",(d,w)->{try{int n=Integer.parseInt(edit.getText().toString());page=Math.max(0,Math.min(renderer.getPageCount()-1,n-1));zoom=1;drawPage();}catch(NumberFormatException ignored){}}).show();}
  private void drawPage(){
    if(renderer==null||closed)return;
    final int ticket=++renderTicket,number=page,width=Math.max(400,(int)(getResources().getDisplayMetrics().widthPixels*zoom));
    busy=true;previous.setEnabled(false);next.setEnabled(false);pageLabel.setText("Loading "+(number+1)+"…");
    worker.execute(()->{
      Bitmap bitmap=null;
      try(PdfRenderer.Page pdf=renderer.openPage(number)){
        int w=Math.min(2400,width);int h=Math.round(w*(float)pdf.getHeight()/pdf.getWidth());
        bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.WHITE);pdf.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
      }catch(Exception|OutOfMemoryError e){if(bitmap!=null)bitmap.recycle();runOnUiThread(()->{busy=false;if(!closed){pageLabel.setText("Could not render page");previous.setEnabled(number>0);next.setEnabled(number<renderer.getPageCount()-1);}});return;}
      final Bitmap ready=bitmap;
      runOnUiThread(()->{
        if(closed||ticket!=renderTicket){ready.recycle();return;}
        Bitmap old=displayed;displayed=ready;image.setImageBitmap(ready);image.setLayoutParams(new android.widget.FrameLayout.LayoutParams(ready.getWidth(),ready.getHeight()));image.setContentDescription("Textbook PDF page "+(number+1));
        if(old!=null&&!old.isRecycled())old.recycle();vertical.scrollTo(0,0);horizontal.scrollTo(0,0);
        pageLabel.setText((number+1)+" / "+renderer.getPageCount());previous.setEnabled(number>0);next.setEnabled(number<renderer.getPageCount()-1);busy=false;
      });
    });
  }
  @Override public void onConfigurationChanged(Configuration configuration){super.onConfigurationChanged(configuration);if(!busy)drawPage();}
  @Override public void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);out.putInt("page",page+1);}
  @Override protected void onDestroy(){closed=true;renderTicket++;image.setImageDrawable(null);if(displayed!=null&&!displayed.isRecycled())displayed.recycle();worker.execute(()->{try{if(renderer!=null)renderer.close();if(descriptor!=null)descriptor.close();}catch(Exception ignored){}});worker.shutdown();super.onDestroy();}
}
