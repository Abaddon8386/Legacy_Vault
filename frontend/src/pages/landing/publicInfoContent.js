export const publicInfoContent = {
  vi: {
    home: 'Trang chủ',
    contents: 'Nội dung trên trang',
    switchLanguage: 'Chuyển sang tiếng Anh',
    support: {
      title: 'Trợ giúp và hỗ trợ',
      intro: 'Tìm hướng dẫn để lấy lại quyền truy cập, sử dụng kho di sản hoặc theo dõi tài sản được bàn giao.',
      sections: [
        {
          id: 'faq',
          title: 'Tài khoản và đăng nhập',
          items: [
            ['Tôi quên mật khẩu, phải làm sao?', 'Mở mục Quên mật khẩu và nhập email đã đăng ký. Nếu tài khoản đủ điều kiện, bạn sẽ nhận được email hướng dẫn đặt lại mật khẩu.'],
            ['Tôi đăng nhập bằng Google và được yêu cầu nhập mật khẩu.', 'Nếu bạn chưa từng đặt mật khẩu cho LegacyVault, chọn Đặt mật khẩu lần đầu và xác nhận bằng tài khoản Google đã liên kết. Bạn có thể tiếp tục thao tác sau khi đặt mật khẩu.'],
          ],
          action: ['/forgot-password', 'Mở trang Quên mật khẩu'],
        },
        {
          id: 'vault',
          title: 'Kho di sản',
          items: [
            ['Tôi có thể lưu gì trong kho?', 'Bạn có thể lưu nội dung tài sản số, tệp đính kèm và các phiên bản di chúc số. Xem gói đang sử dụng để biết giới hạn số tài sản và dung lượng lưu trữ.'],
            ['Điều gì xảy ra khi tôi bỏ lỡ lịch xác nhận hoạt động?', 'Hệ thống chuyển lịch xác nhận sang trạng thái cảnh báo. Cảnh báo và việc hết thời gian gia hạn không tự xác nhận tử vong, mở kho hoặc chuyển giao tài sản.'],
          ],
        },
        {
          id: 'beneficiaries',
          title: 'Người thụ hưởng',
          items: [
            ['Tôi nhận được lời mời, bắt đầu từ đâu?', 'Làm theo hướng dẫn trong lời mời để đăng nhập hoặc tạo tài khoản. Quyền xem tài sản phụ thuộc vào việc liên kết tài khoản với hồ sơ và tiến độ bàn giao.'],
            ['Tôi tìm tài sản đã nhận ở đâu?', 'Đăng nhập bằng tài khoản người thụ hưởng và mở mục Tài sản đã nhận. Bạn chỉ xem được tài sản đã bàn giao cho chính mình.'],
          ],
          action: ['/login', 'Đến trang đăng nhập'],
        },
        {
          id: 'contact',
          title: 'Cần trao đổi về một hồ sơ?',
          paragraphs: [
            'Nếu hồ sơ đang được xử lý, hãy liên hệ nhân viên tiếp nhận qua kênh đã dùng khi nộp hồ sơ. Chuẩn bị mã hồ sơ và mô tả bước bạn đang gặp khó khăn.',
            'Giữ riêng mật khẩu, mã đặt lại mật khẩu và nội dung bí mật trong kho khi trao đổi hỗ trợ.',
          ],
        },
      ],
      related: ['Tìm hiểu cách dữ liệu được bảo vệ', '/privacy'],
    },
    privacy: {
      title: 'Điều khoản bảo mật',
      intro: 'Tìm hiểu LegacyVault lưu thông tin nào, bảo vệ nội dung trong kho ra sao và kiểm tra quyền truy cập như thế nào.',
      notice: 'Thông tin này mô tả các cơ chế đang có trong sản phẩm. Chính sách quyền riêng tư chính thức đang được hoàn thiện.',
      sections: [
        {
          id: 'data',
          title: 'Thông tin bạn cung cấp',
          paragraphs: [
            'LegacyVault sử dụng thông tin tài khoản như tên, email và số điện thoại nếu bạn cung cấp. Khi dùng kho di sản, bạn có thể lưu tài sản số, tài liệu, các phiên bản di chúc và thông tin người thụ hưởng.',
            'Nếu bạn chọn đăng nhập bằng Google, LegacyVault xác minh thông tin đăng nhập do Google cung cấp. Hệ thống không tự gộp hai tài khoản chỉ vì trùng địa chỉ email.',
          ],
        },
        {
          id: 'protection',
          title: 'Cách dữ liệu được bảo vệ',
          paragraphs: [
            'Nội dung bí mật của tài sản, ảnh và tệp đính kèm của tài sản, cùng nội dung tệp di chúc được mã hóa khi lưu. Mật khẩu LegacyVault được lưu dưới dạng mã băm thay vì văn bản có thể đọc được.',
            'Một số thao tác, như mở nội dung bí mật hoặc tải phiên bản di chúc, yêu cầu xác nhận lại bằng mật khẩu LegacyVault.',
          ],
        },
        {
          id: 'access',
          title: 'Ai có quyền truy cập?',
          paragraphs: [
            'Quyền truy cập phụ thuộc vào vai trò, hồ sơ được phân công và trạng thái của hồ sơ. Nhân viên và bộ phận pháp lý xử lý hồ sơ theo quyền được cấp. Người thụ hưởng chỉ xem được tài sản đã bàn giao cho chính mình.',
            'Hệ thống ghi nhật ký cho các thao tác như đăng nhập, mở nội dung tài sản và tải tệp di chúc. Nhật ký phục vụ việc theo dõi và kiểm tra các thao tác này.',
          ],
        },
        {
          id: 'account-safety',
          title: 'Cách tự bảo vệ tài khoản',
          paragraphs: [
            'Giữ riêng mật khẩu và liên kết đặt lại mật khẩu. Đăng xuất sau khi dùng thiết bị chung. Nếu nghi ngờ người khác biết mật khẩu, hãy đổi mật khẩu hoặc dùng mục Quên mật khẩu để lấy lại quyền truy cập.',
          ],
        },
      ],
      related: ['Xem hướng dẫn tài khoản và kho di sản', '/support'],
    },
  },
  en: {
    home: 'Home',
    contents: 'On this page',
    switchLanguage: 'Switch to Vietnamese',
    support: {
      title: 'Help & Support',
      intro: 'Find out how to recover access, use your digital vault, or check the assets handed over to you.',
      sections: [
        {
          id: 'faq',
          title: 'Account and sign-in',
          items: [
            ['I forgot my password. What should I do?', 'Open Forgot password and enter your registered email address. If your account is eligible, you’ll receive an email with instructions to reset your password.'],
            ['I signed in with Google and was asked for a password.', 'If you haven’t set a LegacyVault password, choose Set your first password and confirm with your linked Google account. You can continue after setting a password.'],
          ],
          action: ['/forgot-password', 'Open Forgot password'],
        },
        {
          id: 'vault',
          title: 'Digital vault',
          items: [
            ['What can I keep in my vault?', 'You can keep digital asset content, attachments, and versions of a digital will. Check your current plan for asset and storage limits.'],
            ['What happens if I miss a check-in?', 'The system raises a check-in alert. Neither the alert nor the end of the grace period confirms a death, opens the vault, or transfers assets.'],
          ],
        },
        {
          id: 'beneficiaries',
          title: 'For beneficiaries',
          items: [
            ['I received an invitation. Where do I start?', 'Follow the invitation instructions to sign in or create an account. Access depends on linking your account to the case and on the progress of the handover.'],
            ['Where can I find the assets I received?', 'Sign in as a beneficiary and open Received assets. You can see the assets that have been handed over to you.'],
          ],
          action: ['/login', 'Go to sign-in'],
        },
        {
          id: 'contact',
          title: 'Need help with a case?',
          paragraphs: [
            'If a case is in progress, reach the staff member handling it through the channel you used to submit the case. Have your case number ready and describe the step you’re having trouble with.',
            'Keep passwords, password reset codes and private vault contents to yourself when seeking help.',
          ],
        },
      ],
      related: ['Learn how your data is protected', '/privacy'],
    },
    privacy: {
      title: 'Privacy & Security',
      intro: 'See what LegacyVault stores, how it protects vault contents, and how it checks who can access them.',
      notice: 'This page describes the protections currently built into the product. The formal privacy policy is being finalized.',
      sections: [
        {
          id: 'data',
          title: 'Information you provide',
          paragraphs: [
            'LegacyVault uses account information such as your name, email address and phone number if you provide one. In your vault, you can store digital assets, documents, will versions and beneficiary information.',
            'If you sign in with Google, LegacyVault verifies the sign-in information from Google. Matching email addresses do not automatically merge accounts.',
          ],
        },
        {
          id: 'protection',
          title: 'How we protect your data',
          paragraphs: [
            'Private asset contents, asset photos and attachments, and will files are encrypted when stored. LegacyVault stores password hashes instead of readable passwords.',
            'Some actions, such as opening private asset contents or downloading a will version, require you to confirm your LegacyVault password.',
          ],
        },
        {
          id: 'access',
          title: 'Who can access it?',
          paragraphs: [
            'Access depends on your role, case assignment and case status. Staff and legal reviewers handle cases according to their permissions. Beneficiaries can see the assets handed over to them.',
            'The system records actions such as signing in, opening private asset contents and downloading a will file. These records support activity reviews.',
          ],
        },
        {
          id: 'account-safety',
          title: 'Keeping your account safe',
          paragraphs: [
            'Keep your password and reset links private. Sign out after using a shared device. If you think someone knows your password, change it or use Forgot password to recover access.',
          ],
        },
      ],
      related: ['Find help with your account or vault', '/support'],
    },
  },
};
