"""django-jazzmin 3.0.1 + Django 6 pagination compatibility."""

from __future__ import annotations


def patch_jazzmin_paginator_for_django6() -> None:
    """
    django-jazzmin 3.0.1 calls format_html(html_str) without args; Django 6 rejects that.
    See https://github.com/farridav/django-jazzmin/issues/655
    """
    try:
        from django.contrib.admin.views.main import PAGE_VAR
        from django.utils.safestring import mark_safe
        from jazzmin.templatetags.jazzmin import register
    except ImportError:
        return

    def jazzmin_paginator_number(change_list, i):
        html_str = ""
        start = i == 1
        is_last_page = i == change_list.paginator.num_pages
        spacer = i in (".", "…") or i == change_list.paginator.ELLIPSIS
        current_page = i == change_list.page_num

        if start:
            link = (
                change_list.get_query_string({PAGE_VAR: change_list.page_num - 1})
                if change_list.page_num > 1
                else "#"
            )
            html_str += """
        <li class="page-item previous {disabled}">
            <a class="page-link" href="{link}" data-dt-idx="0" tabindex="0">«</a>
        </li>
        """.format(link=link, disabled="disabled" if link == "#" else "")

        if current_page:
            html_str += """
        <li class="page-item active">
            <a class="page-link" href="javascript:void(0);" data-dt-idx="3" tabindex="0">{num}</a>
        </li>
        """.format(num=i)
        elif spacer:
            html_str += """
        <li class="page-item">
            <a class="page-link" href="javascript:void(0);" data-dt-idx="3" tabindex="0">… </a>
        </li>
        """
        else:
            query_string = change_list.get_query_string({PAGE_VAR: i})
            end_class = "end" if is_last_page else ""
            html_str += """
            <li class="page-item">
            <a href="{query_string}" class="page-link {end}" data-dt-idx="3" tabindex="0">{num}</a>
            </li>
        """.format(num=i, query_string=query_string, end=end_class)

        if is_last_page:
            link = (
                change_list.get_query_string({PAGE_VAR: change_list.page_num + 1})
                if change_list.page_num < i
                else "#"
            )
            html_str += """
        <li class="page-item next {disabled}">
            <a class="page-link" href="{link}" data-dt-idx="7" tabindex="0">»</a>
        </li>
        """.format(link=link, disabled="disabled" if link == "#" else "")

        return mark_safe(html_str)

    register.simple_tag(jazzmin_paginator_number, name="jazzmin_paginator_number")
