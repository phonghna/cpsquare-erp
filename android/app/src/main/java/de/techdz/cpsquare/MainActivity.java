package de.techdz.cpsquare;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The site's IMEI/barcode scanner uses the browser's camera API
        // (getUserMedia). Android's WebView only grants that to the page if
        // this app already holds the CAMERA runtime permission, so request
        // it up front rather than leaving staff to hit a silent camera
        // failure the first time they try to scan.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, 1001);
        }
    }
}
