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
            ['Điều gì xảy ra khi tôi bỏ lỡ lịch xác nhận hoạt động?', 'Hệ thống chuyển lịch xác nhận sang trạng thái cảnh báo. Cảnh báo và việc hết thời gian ân hạn không tự xác nhận tử vong, mở kho hoặc chuyển giao tài sản.'],
          ],
        },
        {
          id: 'beneficiaries',
          title: 'Người thụ hưởng',
          items: [
            ['Tôi nhận được lời mời, bắt đầu từ đâu?', 'Làm theo hướng dẫn trong lời mời để đăng nhập hoặc tạo tài khoản. Quyền xem tài sản phụ thuộc vào việc liên kết tài khoản với hồ sơ và tiến độ bàn giao.'],
            ['Tôi tìm tài sản đã nhận ở đâu?', 'Đăng nhập bằng tài khoản người thụ hưởng, chọn Tài sản thụ hưởng trên thanh bên rồi xem phần Tài sản đã nhận. Bạn chỉ xem được tài sản đã bàn giao cho chính mình.'],
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
    about: {
      title: 'Về LegacyVault',
      intro: 'LegacyVault giúp bạn sắp xếp tài sản số, lưu giữ giấy tờ và chuẩn bị thông tin cho người thụ hưởng.',
      sections: [
        {
          id: 'digital-legacy',
          title: 'Chuẩn bị di sản số',
          paragraphs: [
            'Chủ sở hữu có thể tạo kho riêng, lưu nội dung tài sản và các phiên bản di chúc, ghi nhận người thụ hưởng và đặt lịch xác nhận hoạt động.',
          ],
        },
        {
          id: 'handover',
          title: 'Từ hồ sơ đến bàn giao',
          paragraphs: [
            'Nhân viên tiếp nhận giấy tờ, bộ phận pháp lý thẩm định hồ sơ và hệ thống ghi nhận việc bàn giao. Người thụ hưởng xem phần tài sản đã được bàn giao cho mình trong tài khoản riêng.',
          ],
        },
        {
          id: 'legal',
          title: 'Giá trị pháp lý và giới hạn',
          paragraphs: [
            'LegacyVault giúp bạn lưu giữ thông tin và chuẩn bị bàn giao theo quy trình của hệ thống. LegacyVault không thay thế di chúc hợp pháp, công chứng hay tư vấn pháp lý, và không xác nhận quyền sở hữu hay giá trị pháp lý của tài sản bạn lưu.',
            'Mỗi loại tài sản có quy định pháp luật riêng, và quy định về một số loại, như tài sản số hay tiền mã hóa, đang được xây dựng và có thể thay đổi. Việc một tài sản được lưu trong kho không có nghĩa tài sản đó được pháp luật công nhận hoặc được phép chuyển giao.',
            'Hãy tham khảo luật sư hoặc công chứng viên trước khi dựa vào LegacyVault cho việc phân chia di sản.',
          ],
          references: {
            title: 'Cơ sở pháp lý tham khảo',
            labels: { uses: 'Trong LegacyVault:' },
            note: 'Danh sách để tham khảo, không phải tư vấn pháp lý. Đã đối chiếu với văn bản chính thức ngày 07/11/2026 (riêng Điều 620 Bộ luật Dân sự: 12/11/2026). Văn bản có thể được sửa đổi sau thời điểm này.',
            items: [
              {
                name: 'Bộ luật Dân sự 2015 (Luật số 91/2015/QH13)',
                note: 'Điều 620: từ chối nhận di sản (phải lập thành văn bản và thể hiện trước thời điểm phân chia di sản). Điều 609, 612 và 649: quyền thừa kế, di sản, thừa kế theo pháp luật. Điều 624 và 630: di chúc, di chúc hợp pháp. Điều 105: tài sản. Điều 46: giám hộ. Điều 71: tuyên bố chết.',
                valid: 'Có hiệu lực từ 01/01/2017.',
                uses: 'lưu di chúc, tài sản và người thụ hưởng của chủ kho, và chỉ chia tài sản sau khi có văn bản phân chia đã được bộ phận pháp lý thẩm định. Việc từ chối nhận di sản phải có trước khi phân chia nên LegacyVault không thay người thừa kế thực hiện hay xác nhận việc từ chối.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-91-2015-qh13-18397.htm',
              },
              {
                name: 'Luật Công chứng (Luật số 46/2024/QH15)',
                note: 'Điều 58 đến Điều 61: công chứng di chúc, văn bản phân chia di sản, văn bản từ chối nhận di sản, gửi giữ và công bố di chúc.',
                valid: 'Có hiệu lực từ 01/07/2025. Luật số 04/2026/QH16 sửa đổi, bổ sung có hiệu lực từ 01/01/2027.',
                uses: 'lưu các phiên bản di chúc và tiếp nhận văn bản phân chia kèm bản số hóa để thẩm định. LegacyVault không công chứng thay bạn.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-46-2024-qh15-43574.htm',
              },
              {
                name: 'Luật Hộ tịch (Luật số 60/2014/QH13)',
                note: 'Điều 32 đến Điều 34: thẩm quyền, thời hạn, trách nhiệm và thủ tục đăng ký khai tử.',
                valid: 'Có hiệu lực từ 01/01/2016. Luật Hộ tịch số 03/2026/QH16 (thông qua 23/04/2026) có hiệu lực từ 01/03/2027.',
                uses: 'giấy chứng tử hoặc trích lục khai tử được nhân viên tiếp nhận ở bước xác minh tử vong.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-60-2014-qh13-5264.htm',
              },
              {
                name: 'Luật Giao dịch điện tử (Luật số 20/2023/QH15)',
                note: 'Điều 8 đến Điều 13: giá trị pháp lý của thông điệp dữ liệu (như văn bản, như bản gốc, làm chứng cứ), chuyển đổi hình thức và lưu trữ.',
                valid: 'Có hiệu lực từ 01/07/2024.',
                uses: 'lưu bản số hóa giấy tờ, tệp di chúc và biên nhận bàn giao, kèm nhật ký thao tác.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-20-2023-qh15-39848.htm',
              },
              {
                name: 'Luật Công nghiệp công nghệ số (Luật số 71/2025/QH15)',
                note: 'Điều 46 đến Điều 48: tài sản số, phân loại (gồm tài sản ảo và tài sản mã hóa) và quản lý tài sản số.',
                valid: 'Có hiệu lực từ 01/01/2026.',
                uses: 'nhắc bạn khi thêm tài sản rằng lưu trong kho không có nghĩa pháp luật công nhận hay cho phép chuyển giao tài sản đó.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-71-2025-qh15-45555.htm',
              },
              {
                name: 'Nghị quyết số 05/2025/NQ-CP của Chính phủ',
                note: 'Thí điểm thị trường tài sản mã hóa trong 5 năm kể từ 09/09/2025.',
                uses: 'vì khuôn khổ còn thí điểm, LegacyVault chỉ lưu thông tin và nhắc lưu ý khi thêm tài sản mã hóa, không bảo đảm việc chuyển giao.',
                href: 'https://vanban.chinhphu.vn/?pageid=27160&docid=215249',
              },
              {
                name: 'Luật Bảo vệ dữ liệu cá nhân (Luật số 91/2025/QH15)',
                note: 'Điều 1: phạm vi. Điều 4: quyền và nghĩa vụ của chủ thể dữ liệu. Điều 9: sự đồng ý.',
                valid: 'Có hiệu lực từ 01/01/2026.',
                uses: 'phần nhạy cảm trong thông tin của chủ kho, người thụ hưởng và người thi hành được mã hóa, và chỉ người có vai trò phù hợp mới xem được. Xem trang Bảo mật và quyền riêng tư.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-91-2025-qh15-45578.htm',
              },
            ],
          },
        },
      ],
      related: ['Tìm hướng dẫn sử dụng LegacyVault', '/support'],
    },
    privacy: {
      title: 'Bảo mật và quyền riêng tư',
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
            ['Where can I find the assets I received?', 'Sign in as a beneficiary, choose Shared with me in the sidebar, and look under Received assets. You can see the assets that have been handed over to you.'],
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
    about: {
      title: 'About LegacyVault',
      intro: 'LegacyVault helps you organise digital assets, keep important documents and prepare information for your beneficiaries.',
      sections: [
        {
          id: 'digital-legacy',
          title: 'Preparing your digital legacy',
          paragraphs: [
            'Owners can create a private vault, store asset contents and will versions, record beneficiaries and schedule check-ins.',
          ],
        },
        {
          id: 'handover',
          title: 'From case intake to handover',
          paragraphs: [
            'Staff receive documents, legal reviewers assess the case, and the system records the handover. Beneficiaries can view the assets handed over to them in their own accounts.',
          ],
        },
        {
          id: 'legal',
          title: 'Legal status and limits',
          paragraphs: [
            'LegacyVault helps you keep information and prepare a handover through its own process. It does not replace a valid will, notarisation or legal advice, and it does not confirm ownership or the legal status of what you store.',
            'Each kind of asset has its own legal rules, and the rules for some kinds, such as digital assets and crypto assets, are still being developed and may change. Storing an asset in your vault does not mean the law recognises it or allows it to be transferred.',
            'Please consult a lawyer or a notary before relying on LegacyVault to divide an estate.',
          ],
          references: {
            title: 'Legal references',
            labels: { uses: 'In LegacyVault:' },
            note: 'For reference only, not legal advice. Checked against the official texts on 7 November 2026 (Article 620 of the Civil Code: 12 November 2026). The texts are in Vietnamese and may be amended after that date.',
            items: [
              {
                name: 'Civil Code 2015 (Law No. 91/2015/QH13)',
                note: 'Article 620: refusing an inheritance (in writing, before the estate is divided). Articles 609, 612 and 649: right of inheritance, the estate, intestate succession. Articles 624 and 630: wills, valid wills. Article 105: property. Article 46: guardianship. Article 71: declaration of death.',
                valid: 'In force since 1 January 2017.',
                uses: 'it stores the owner\'s will, assets and beneficiaries, and divides assets only after a division document that the legal team has reviewed. A refusal must come before the division, so LegacyVault does not carry out or confirm an heir\'s refusal for them.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-91-2015-qh13-18397.htm',
              },
              {
                name: 'Law on Notarization (Law No. 46/2024/QH15)',
                note: 'Articles 58 to 61: notarising wills, estate-division documents and refusals of an inheritance, depositing and disclosing wills.',
                valid: 'In force since 1 July 2025. Law No. 04/2026/QH16 amending it takes effect on 1 January 2027.',
                uses: 'it stores will versions and receives division documents with a digital copy for review. LegacyVault does not notarise anything for you.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-46-2024-qh15-43574.htm',
              },
              {
                name: 'Law on Civil Status (Law No. 60/2014/QH13)',
                note: 'Articles 32 to 34: authority, deadline, responsibility and procedure for registering a death.',
                valid: 'In force since 1 January 2016. Civil Status Law No. 03/2026/QH16 (passed 23 April 2026) takes effect on 1 March 2027.',
                uses: 'Staff receive a death certificate or an extract of the death register at the death-verification step.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-60-2014-qh13-5264.htm',
              },
              {
                name: 'Law on Electronic Transactions (Law No. 20/2023/QH15)',
                note: 'Articles 8 to 13: legal value of data messages (as writing, as an original, as evidence), format conversion and storage.',
                valid: 'In force since 1 July 2024.',
                uses: 'it stores digitised documents, will files and handover receipts, with a log of actions.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-20-2023-qh15-39848.htm',
              },
              {
                name: 'Law on Digital Technology Industry (Law No. 71/2025/QH15)',
                note: 'Articles 46 to 48: digital assets, their classification (including virtual assets and crypto assets) and their management.',
                valid: 'In force since 1 January 2026.',
                uses: 'it reminds you when you add an asset that storing it in a vault does not mean the law recognises it or allows it to be transferred.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-71-2025-qh15-45555.htm',
              },
              {
                name: 'Government Resolution No. 05/2025/NQ-CP',
                note: 'A five-year pilot of the crypto asset market from 9 September 2025.',
                uses: 'because the framework is a pilot, LegacyVault only records information and reminds you of this when you add a crypto asset. It does not guarantee a transfer.',
                href: 'https://vanban.chinhphu.vn/?pageid=27160&docid=215249',
              },
              {
                name: 'Law on Personal Data Protection (Law No. 91/2025/QH15)',
                note: 'Article 1: scope. Article 4: rights and duties of data subjects. Article 9: consent.',
                valid: 'In force since 1 January 2026.',
                uses: 'sensitive parts of the information about owners, beneficiaries and executors are encrypted, and only people with a suitable role can see them. See the Privacy & Security page.',
                href: 'https://congbao.chinhphu.vn/van-ban/luat-so-91-2025-qh15-45578.htm',
              },
            ],
          },
        },
      ],
      related: ['Find help using LegacyVault', '/support'],
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
