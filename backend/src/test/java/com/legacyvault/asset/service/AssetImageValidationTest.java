package com.legacyvault.asset.service;

import com.legacyvault.common.error.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import static org.junit.jupiter.api.Assertions.*;

class AssetImageValidationTest {
    @Test void acceptsActualPngAndRejectsSpoofedOrOversizedFiles() throws Exception {
        var out=new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB),"png",out);
        var good=new MockMultipartFile("images","a.png","image/png",out.toByteArray());
        assertEquals("image/png",AssetImageService.inspect(good).contentType());
        var spoof=new MockMultipartFile("images","a.png","image/png","%PDF-fake".getBytes());
        assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE,assertThrows(BusinessException.class,()->AssetImageService.inspect(spoof)).getErrorCode());
        var broken=new MockMultipartFile("images","a.png","image/png",new byte[]{(byte)137,80,78,71,13,10,26,10});
        assertThrows(BusinessException.class,()->AssetImageService.inspect(broken));
        var large=new MockMultipartFile("images","a.jpg","image/jpeg",new byte[(int)AssetImageService.MAX_BYTES+1]);
        assertEquals(ErrorCode.PAYLOAD_TOO_LARGE,assertThrows(BusinessException.class,()->AssetImageService.inspect(large)).getErrorCode());
    }
}
